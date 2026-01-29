import { describe, expect, it, vi } from 'vitest';
import { ModelClient } from '../modelClient';
import type { AstraCodexSettings } from '../settings';

const settings: AstraCodexSettings = {
  baseUrl: 'http://localhost:11434',
  model: 'model',
  includeActiveNote: false,
  maxContextChars: 8000,
  maxMemoryChars: 2000,
  contextSliderValue: 50
};

const createStreamResponse = (chunks: string[]) => {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = encoder.encode(chunks[index]);
          index += 1;
          return { done: false, value };
        }
      })
    }
  } as Response;
};

describe('ModelClient streaming', () => {
  it('sends stop sequences to prevent hallucination', async () => {
    // Bug: Model was generating fake "User:" lines, hallucinating entire conversations
    // Fix: Pass stop sequences to Ollama so it stops before generating fake user messages
    const chunks = [JSON.stringify({ done: true }) + '\n'];
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse(chunks));
    const client = new ModelClient(settings, fetchMock as unknown as typeof fetch);

    await client.generateStream('prompt', () => undefined);

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.options.stop).toContain('User:');
    expect(body.options.stop).toContain('Human:');
    expect(body.options.stop).toContain('Memory:');
  });

  it('truncates hallucinated conversation continuations', async () => {
    // Bug: Model generated "STATE: acting\nAssistant: ...\nUser: ..." in a single response
    // Fix: Post-process to detect and truncate these hallucinations
    const hallucinated = 'STATE: idle\nNEEDS_CONFIRMATION: false\nFINAL: Done!\nUser: Now do something else\nAssistant: Sure!';
    const chunks = [JSON.stringify({ response: hallucinated }) + '\n'];
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse(chunks));
    const client = new ModelClient(settings, fetchMock as unknown as typeof fetch);
    const deltas: string[] = [];

    const result = await client.generateStream('prompt', (delta) => deltas.push(delta));

    // The result.text should be truncated before the hallucinated "User:" line
    expect(result.text).not.toContain('User: Now do something else');
    expect(result.text).not.toContain('Assistant: Sure!');
    expect(result.text).toContain('FINAL: Done!');
  });

  it('streams deltas and parses header', async () => {
    const chunks = [
      JSON.stringify({ response: 'STATE: idle\nNEEDS_CONFIRMATION: false\nHello ' }) + '\n',
      JSON.stringify({ response: 'world' }) + '\n',
      JSON.stringify({ done: true }) + '\n'
    ];
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse(chunks));
    const client = new ModelClient(settings, fetchMock as unknown as typeof fetch);
    const deltas: string[] = [];

    const result = await client.generateStream('prompt', (delta) => deltas.push(delta));

    expect(deltas.join('')).toContain('Hello world');
    expect(result.header.state).toBe('idle');
    expect(result.header.needsConfirmation).toBe(false);
  });

  it('passes AbortSignal into fetch options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([JSON.stringify({ done: true }) + '\n']));
    const client = new ModelClient(settings, fetchMock as unknown as typeof fetch);
    const controller = new AbortController();

    await client.generateStream('prompt', () => undefined, { signal: controller.signal });

    const call = fetchMock.mock.calls[0]?.[1] as any;
    expect(call?.signal).toBe(controller.signal);
  });
});
