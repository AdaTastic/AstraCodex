import { describe, expect, it, vi } from 'vitest';
import { executeToolCall, extractFencedToolCall, formatToolActivity, stripToolBlocks } from '../toolOrchestrator';

describe('toolOrchestrator', () => {
  it('extracts a fenced tool block with retrigger', () => {
    const text = `Hello\n\n\`\`\`tool\n{"name":"read","args":{"path":"note.md"},"retrigger":{"message":"Summarize"}}\n\`\`\`\n`;
    const extracted = extractFencedToolCall(text);

    expect(extracted?.toolCall.name).toBe('read');
    expect(extracted?.toolCall.args).toEqual({ path: 'note.md' });
    expect(extracted?.toolCall.retrigger?.message).toBe('Summarize');
  });

  it('does not extract when block is not fenced as tool', () => {
    const text = `TOOL_CALL {"name":"read"}`;
    expect(extractFencedToolCall(text)).toBeNull();
  });

  it('executes tool call and returns retrigger message', async () => {
    const runner = {
      executeTool: vi.fn(async () => ({ ok: true }))
    } as any;

    const result = await executeToolCall(runner, {
      name: 'list',
      args: { prefix: '' },
      retrigger: { message: 'Pick a file and read it' }
    });

    expect(runner.executeTool).toHaveBeenCalledWith('list', { prefix: '' });
    expect(result.result).toEqual({ ok: true });
    expect(result.retriggerMessage).toBe('Pick a file and read it');
  });

  it('formats tool activity lines for display', () => {
    expect(formatToolActivity({ name: 'active_file', args: {} })).toBe('reading: [current file]');
    expect(formatToolActivity({ name: 'list', args: { prefix: 'Harmful' } })).toBe('listing: Harmful');
    expect(formatToolActivity({ name: 'read', args: { path: 'note.md' } })).toBe('reading: note.md');
  });

  it('strips tool blocks from assistant text', () => {
    const text = `Hello\n\n\`\`\`tool\n{"name":"list","args":{"prefix":""}}\n\`\`\`\n\nWorld`;
    expect(stripToolBlocks(text)).toBe('Hello\n\nWorld');
  });
});
