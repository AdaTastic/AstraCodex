import { describe, expect, it, vi } from 'vitest';
import { executeToolCall, extractFencedToolCall, formatToolActivity, stripToolBlocks, isExtractionError } from '../toolOrchestrator';

describe('toolOrchestrator', () => {
  it('extracts a fenced tool block with retrigger', () => {
    const text = `Hello\n\n\`\`\`tool\n{"name":"read","args":{"path":"note.md"},"retrigger":{"message":"Summarize"}}\n\`\`\`\n`;
    const extracted = extractFencedToolCall(text);

    expect(isExtractionError(extracted)).toBe(false);
    if (!isExtractionError(extracted) && extracted) {
      expect(extracted.toolCall.name).toBe('read');
      expect(extracted.toolCall.args).toEqual({ path: 'note.md' });
      expect(extracted.toolCall.retrigger?.message).toBe('Summarize');
    }
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

  it('when multiple tool blocks detected, uses the LAST one', () => {
    // Model often outputs planning block in think, real block after
    const text = `STATE: acting\n\n\`\`\`tool\n{"name":"list","args":{"prefix":"first"}}\n\`\`\`\n\nFINAL: Here\n\n\`\`\`tool\n{"name":"read","args":{"path":"note.md"}}\n\`\`\``;
    const extracted = extractFencedToolCall(text);

    // Should NOT be an error - use the last block
    expect(isExtractionError(extracted)).toBe(false);
    if (!isExtractionError(extracted) && extracted) {
      // Last block should be used
      expect(extracted.toolCall.name).toBe('read');
      expect(extracted.toolCall.args).toEqual({ path: 'note.md' });
    }
  });

  it('extracts tool block that appears inside think tags', () => {
    // Some models put tool blocks inside think, then close think
    const text = `<think>Let me read that.\n\n\`\`\`tool\n{"name":"read","args":{"path":"note.md"}}\n\`\`\`</think>STATE: acting`;
    const extracted = extractFencedToolCall(text);

    expect(isExtractionError(extracted)).toBe(false);
    if (!isExtractionError(extracted) && extracted) {
      expect(extracted.toolCall.name).toBe('read');
      expect(extracted.toolCall.args).toEqual({ path: 'note.md' });
    }
  });

  it('extracts tool block that appears after FINAL:', () => {
    // Model puts FINAL: text then tool block
    const text = `STATE: acting\nNEEDS_CONFIRMATION: false\nFINAL: I'll read that now.\n\`\`\`tool\n{"name":"read","args":{"path":"HABs.md"}}\n\`\`\``;
    const extracted = extractFencedToolCall(text);

    expect(isExtractionError(extracted)).toBe(false);
    if (!isExtractionError(extracted) && extracted) {
      expect(extracted.toolCall.name).toBe('read');
      expect(extracted.toolCall.args).toEqual({ path: 'HABs.md' });
    }
  });

  it('when tool in think AND after, uses the one outside think', () => {
    const text = `<think>\`\`\`tool\n{"name":"list","args":{}}\n\`\`\`</think>\`\`\`tool\n{"name":"read","args":{"path":"real.md"}}\n\`\`\``;
    const extracted = extractFencedToolCall(text);

    expect(isExtractionError(extracted)).toBe(false);
    if (!isExtractionError(extracted) && extracted) {
      // Prefer the one outside think (last one)
      expect(extracted.toolCall.name).toBe('read');
      expect(extracted.toolCall.args).toEqual({ path: 'real.md' });
    }
  });
});
