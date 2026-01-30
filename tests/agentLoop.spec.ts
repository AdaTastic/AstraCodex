import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop } from '../agentLoop';
import type { Message } from '../types';
import type { ToolRunner } from '../toolRunner';

const createMockModel = (responses: string[]) => {
  let callIndex = 0;
  return {
    generateStream: vi.fn(async (prompt: string, onDelta: (text: string) => void) => {
      const response = responses[callIndex] ?? '';
      callIndex++;
      onDelta(response);
      return {
        text: response,
        header: { state: 'idle', needsConfirmation: false }
      };
    })
  };
};

const createMockToolRunner = () => ({
  executeTool: vi.fn().mockResolvedValue({ files: ['a.md'] })
} as unknown as ToolRunner);

describe('runAgentLoop', () => {
  it('runs single turn without tool call', async () => {
    const model = createMockModel(['Hello, how can I help?']);
    const runner = createMockToolRunner();
    const history: Message[] = [{ role: 'user', content: 'Hi' }];
    const onTurnStart = vi.fn();

    const result = await runAgentLoop({
      history,
      buildPrompt: (h) => h.map(m => `${m.role}: ${m.content}`).join('\n'),
      model,
      toolRunner: runner,
      callbacks: { onTurnStart }
    });

    expect(result.text).toBe('Hello, how can I help?');
    expect(onTurnStart).toHaveBeenCalledWith({ turn: 0, history: expect.any(Array) });
    expect(runner.executeTool).not.toHaveBeenCalled();
  });

  it('executes tool and loops when tool_call present', async () => {
    const model = createMockModel([
      '<tool_call>{"name": "list", "arguments": {"prefix": ""}}</tool_call>',
      'Found files: a.md'
    ]);
    const runner = createMockToolRunner();
    const history: Message[] = [{ role: 'user', content: 'List files' }];
    const onToolResult = vi.fn();
    const onMessageAdded = vi.fn();

    const result = await runAgentLoop({
      history,
      buildPrompt: (h) => h.map(m => `${m.role}: ${m.content}`).join('\n'),
      model,
      toolRunner: runner,
      callbacks: { onToolResult, onMessageAdded }
    });

    expect(runner.executeTool).toHaveBeenCalledWith('list', { prefix: '' });
    expect(onToolResult).toHaveBeenCalledWith({ name: 'list', result: { files: ['a.md'] } });
    expect(result.text).toBe('Found files: a.md');
    
    // Should have added: assistant (with tool), tool result, assistant (final)
    expect(onMessageAdded).toHaveBeenCalledTimes(3);
  });

  it('respects maxTurns limit', async () => {
    // Model keeps outputting tool calls forever
    const model = createMockModel([
      '<tool_call>{"name": "list", "arguments": {}}</tool_call>',
      '<tool_call>{"name": "list", "arguments": {}}</tool_call>',
      '<tool_call>{"name": "list", "arguments": {}}</tool_call>',
      '<tool_call>{"name": "list", "arguments": {}}</tool_call>'
    ]);
    const runner = createMockToolRunner();
    const history: Message[] = [{ role: 'user', content: 'Loop forever' }];

    await runAgentLoop({
      history,
      buildPrompt: (h) => 'prompt',
      model,
      toolRunner: runner,
      maxTurns: 2
    });

    // Only 2 turns allowed
    expect(model.generateStream).toHaveBeenCalledTimes(2);
  });

  it('adds tool result as role:tool message', async () => {
    const model = createMockModel([
      '<tool_call>{"name": "read", "arguments": {"path": "test.md"}}</tool_call>',
      'Done'
    ]);
    const runner = {
      executeTool: vi.fn().mockResolvedValue('file content here')
    } as unknown as ToolRunner;
    const history: Message[] = [{ role: 'user', content: 'Read test.md' }];

    await runAgentLoop({
      history,
      buildPrompt: (h) => 'prompt',
      model,
      toolRunner: runner
    });

    // Check that tool message was added
    const toolMsg = history.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toBe('file content here');
    expect(toolMsg?.tool_result).toBe('file content here');
  });
});
