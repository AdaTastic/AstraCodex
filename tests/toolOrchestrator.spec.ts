import { describe, it, expect, vi } from 'vitest';
import { 
  extractFencedToolCall, 
  formatToolActivity, 
  stripToolBlocks, 
  executeToolCall,
  isExtractionError
} from '../toolOrchestrator';
import type { ToolRunner } from '../toolRunner';

describe('extractFencedToolCall', () => {
  it('extracts XML tool call with arguments', () => {
    const text = `I will read the file.
<tool_call>
{"name": "read", "arguments": {"path": "file.md"}}
</tool_call>`;
    const result = extractFencedToolCall(text);
    expect(result).not.toBeNull();
    expect(isExtractionError(result)).toBe(false);
    if (result && !isExtractionError(result)) {
      expect(result.toolCall.name).toBe('read');
      expect(result.toolCall.arguments).toEqual({ path: 'file.md' });
    }
  });

  it('extracts XML tool call without arguments', () => {
    const text = `<tool_call>{"name": "active_file"}</tool_call>`;
    const result = extractFencedToolCall(text);
    expect(result).not.toBeNull();
    if (result && !isExtractionError(result)) {
      expect(result.toolCall.name).toBe('active_file');
      expect(result.toolCall.arguments).toEqual({});
    }
  });

  it('uses LAST tool block when multiple exist', () => {
    const text = `First:
<tool_call>{"name": "list", "arguments": {"prefix": ""}}</tool_call>
Second:
<tool_call>{"name": "read", "arguments": {"path": "final.md"}}</tool_call>`;
    const result = extractFencedToolCall(text);
    expect(result).not.toBeNull();
    if (result && !isExtractionError(result)) {
      expect(result.toolCall.name).toBe('read');
      expect(result.toolCall.arguments).toEqual({ path: 'final.md' });
    }
  });

  it('returns null when no tool block present', () => {
    const text = 'Just regular text without any tool calls.';
    const result = extractFencedToolCall(text);
    expect(result).toBeNull();
  });

  it('handles unclosed XML tool block', () => {
    const text = `<tool_call>{"name": "list", "arguments": {"prefix": "test/"}}`;
    const result = extractFencedToolCall(text);
    expect(result).not.toBeNull();
    if (result && !isExtractionError(result)) {
      expect(result.toolCall.name).toBe('list');
    }
  });
});

describe('formatToolActivity', () => {
  it('formats list tool', () => {
    expect(formatToolActivity({ name: 'list', arguments: { prefix: 'docs/' } }))
      .toBe('listing: docs/');
  });

  it('formats list tool with empty prefix', () => {
    expect(formatToolActivity({ name: 'list', arguments: { prefix: '' } }))
      .toBe('listing: [all files]');
  });

  it('formats read tool', () => {
    expect(formatToolActivity({ name: 'read', arguments: { path: 'test.md' } }))
      .toBe('reading: test.md');
  });

  it('formats write tool', () => {
    expect(formatToolActivity({ name: 'write', arguments: { path: 'out.md' } }))
      .toBe('editing: out.md');
  });

  it('formats active_file tool', () => {
    expect(formatToolActivity({ name: 'active_file' }))
      .toBe('reading: [current file]');
  });

  it('formats unknown tool', () => {
    expect(formatToolActivity({ name: 'custom_tool', arguments: {} }))
      .toBe('tool: custom_tool');
  });
});

describe('stripToolBlocks', () => {
  it('removes XML tool blocks', () => {
    const text = `Before
<tool_call>{"name": "read", "arguments": {"path": "x"}}</tool_call>
After`;
    expect(stripToolBlocks(text)).toBe('Before\n\nAfter');
  });

  it('removes multiple tool blocks', () => {
    const text = `A <tool_call>{"name": "a"}</tool_call> B <tool_call>{"name": "b"}</tool_call> C`;
    expect(stripToolBlocks(text)).toBe('A  B  C');
  });

  it('handles text with no tool blocks', () => {
    const text = 'Plain text';
    expect(stripToolBlocks(text)).toBe('Plain text');
  });
});

describe('executeToolCall', () => {
  it('executes tool and returns result', async () => {
    const mockRunner = {
      executeTool: vi.fn().mockResolvedValue({ files: ['a.md', 'b.md'] })
    } as unknown as ToolRunner;

    const result = await executeToolCall(mockRunner, { name: 'list', arguments: { prefix: '' } });
    
    expect(result.name).toBe('list');
    expect(result.result).toEqual({ files: ['a.md', 'b.md'] });
    expect(mockRunner.executeTool).toHaveBeenCalledWith('list', { prefix: '' });
  });
});
