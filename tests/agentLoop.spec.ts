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

  it('uses the last tool block when multiple are present', async () => {
    const model = {
      generateStream: vi
        .fn()
        // Returns multiple tool blocks - should use the LAST one
        .mockResolvedValueOnce({
          header: { state: 'acting', needsConfirmation: false },
          text: 'STATE: acting\n```tool\n{"name":"list","args":{}}\n```\nFINAL: here\n```tool\n{"name":"read","args":{"path":"correct.md"},"retrigger":{"message":"reading"}}\n```'
        })
        // After tool execution
        .mockResolvedValueOnce({
          header: { state: 'idle', needsConfirmation: false },
          text: 'Done reading.'
        })
    };

    const toolRunner = {
      executeTool: vi.fn(async () => 'file content')
    } as any;

    const result = await runAgentLoop({
      initialUserMessage: 'Read file',
      buildPrompt: (msg) => msg,
      model: model as any,
      toolRunner
    });

    // Should use the LAST tool block (read with path), not the first (list)
    expect(toolRunner.executeTool).toHaveBeenCalledWith('read', { path: 'correct.md' });
    expect(model.generateStream).toHaveBeenCalledTimes(2);
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
