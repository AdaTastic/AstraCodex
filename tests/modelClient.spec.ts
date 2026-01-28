import { describe, expect, it, vi } from 'vitest';
import { ModelClient } from '../modelClient';
import type { AstraCodexSettings } from '../settings';

const settings: AstraCodexSettings = {
  baseUrl: 'http://localhost:11434',
  model: 'model',
  includeActiveNote: false,
  maxContextChars: 8000,
  maxMemoryChars: 2000
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
  it('streams deltas and parses header', async () => {
    const chunks = [
      JSON.stringify({ response: 'STATE: idle\nNEEDS_CONFIRMATION: false\nPROPOSED_ACTION: none\nHello ' }) + '\n',
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
});