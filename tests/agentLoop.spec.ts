import { describe, expect, it, vi } from 'vitest';
import { runAgentLoop } from '../agentLoop';

describe('agentLoop', () => {
  it('runs tool, then retriggers with tool result appended, then stops when no tool call', async () => {
    const model = {
      generateStream: vi
        .fn()
        // First call returns a tool block + retrigger
        .mockResolvedValueOnce({
          header: { state: 'thinking', needsConfirmation: false },
          text: 'STATE: thinking\nNEEDS_CONFIRMATION: false\n\n```tool\n{"name":"list","args":{"prefix":""},"retrigger":{"message":"Pick the best match and read it"}}\n```'
        })
        // Second call returns plain text (no tool)
        .mockResolvedValueOnce({
          header: { state: 'thinking', needsConfirmation: false },
          text: 'STATE: thinking\nNEEDS_CONFIRMATION: false\n\nDone.'
        })
    };

    const toolRunner = {
      executeTool: vi.fn(async () => ['A.md', 'B.md'])
    } as any;

    const prompts: string[] = [];
    const turns: Array<{ turn: number; userMessage: string }> = [];
    const result = await runAgentLoop({
      initialUserMessage: 'Summarize file A',
      buildPrompt: (userMessage) => {
        prompts.push(userMessage);
        return `PROMPT:${userMessage}`;
      },
      model: model as any,
      toolRunner,
      callbacks: {
        onTurnStart: (payload) => turns.push(payload)
      }
    });

    expect(toolRunner.executeTool).toHaveBeenCalledWith('list', { prefix: '' });
    // second turn userMessage contains tool result
    expect(prompts[1]).toContain('Pick the best match and read it');
    expect(prompts[1]).toContain('Tool Result (list)');
    expect(turns.map((t) => t.turn)).toEqual([0, 1]);
    expect(result.text).toContain('Done.');
  });

  it('calls onToolError and retries when multiple tool blocks detected', async () => {
    const model = {
      generateStream: vi
        .fn()
        // First call returns multiple tool blocks (error case)
        .mockResolvedValueOnce({
          header: { state: 'acting', needsConfirmation: false },
          text: 'STATE: acting\n```tool\n{"name":"read","args":{}}\n```\nFINAL: here\n```tool\n{"name":"read","args":{}}\n```'
        })
        // Second call after error retry returns valid single block
        .mockResolvedValueOnce({
          header: { state: 'acting', needsConfirmation: false },
          text: 'STATE: acting\n```tool\n{"name":"read","args":{"path":"a.md"},"retrigger":{"message":"reading"}}\n```'
        })
        // Third call after tool execution
        .mockResolvedValueOnce({
          header: { state: 'idle', needsConfirmation: false },
          text: 'Done reading.'
        })
    };

    const toolRunner = {
      executeTool: vi.fn(async () => 'file content')
    } as any;

    const toolErrors: string[] = [];
    const result = await runAgentLoop({
      initialUserMessage: 'Read file',
      buildPrompt: (msg) => msg,
      model: model as any,
      toolRunner,
      callbacks: {
        onToolError: ({ error }) => toolErrors.push(error)
      }
    });

    expect(toolErrors.length).toBe(1);
    expect(toolErrors[0]).toContain('Multiple tool blocks');
    expect(model.generateStream).toHaveBeenCalledTimes(3);
  });

  it('stops after maxTurns limit', async () => {
    const model = {
      generateStream: vi.fn().mockResolvedValue({
        header: { state: 'acting', needsConfirmation: false },
        text: '```tool\n{"name":"list","args":{},"retrigger":{"message":"continue"}}\n```'
      })
    };

    const toolRunner = {
      executeTool: vi.fn(async () => [])
    } as any;

    const turns: number[] = [];
    const result = await runAgentLoop({
      initialUserMessage: 'List files',
      buildPrompt: (msg) => msg,
      model: model as any,
      toolRunner,
      maxTurns: 3,
      callbacks: {
        onTurnStart: ({ turn }) => turns.push(turn)
      }
    });

    expect(turns).toEqual([0, 1, 2]);
    expect(model.generateStream).toHaveBeenCalledTimes(3);
  });

  it('throws AbortError when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const model = {
      generateStream: vi.fn().mockResolvedValue({
        header: { state: 'idle', needsConfirmation: false },
        text: 'Hello'
      })
    };

    const toolRunner = { executeTool: vi.fn() } as any;

    await expect(
      runAgentLoop({
        initialUserMessage: 'Hello',
        buildPrompt: (msg) => msg,
        model: model as any,
        toolRunner,
        signal: controller.signal
      })
    ).rejects.toThrow('Aborted');
  });
});
