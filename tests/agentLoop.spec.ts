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
});
