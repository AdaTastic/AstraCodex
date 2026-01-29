import { describe, it, expect } from 'vitest';
import { parseMessageSegments } from '../textParser';

describe('parseMessageSegments', () => {
  it('returns single text segment for plain text', () => {
    const segments = parseMessageSegments('Hello world');
    expect(segments).toEqual([{ type: 'text', content: 'Hello world' }]);
  });

  it('strips think blocks from text', () => {
    const segments = parseMessageSegments('<think>internal</think>Visible text');
    expect(segments).toEqual([{ type: 'text', content: 'Visible text' }]);
  });

  it('extracts tool segment from XML tool_call', () => {
    const text = `Before
<tool_call>{"name": "read", "arguments": {"path": "file.md"}}</tool_call>
After`;
    const segments = parseMessageSegments(text);
    expect(segments.length).toBe(3);
    expect(segments[0]).toEqual({ type: 'text', content: 'Before' });
    expect(segments[1]).toMatchObject({ 
      type: 'tool', 
      toolName: 'read',
      activity: expect.stringContaining('reading')
    });
    expect(segments[2]).toEqual({ type: 'text', content: 'After' });
  });

  it('handles multiple tool calls', () => {
    const text = `Step 1
<tool_call>{"name": "list", "arguments": {"prefix": ""}}</tool_call>
Step 2
<tool_call>{"name": "read", "arguments": {"path": "test.md"}}</tool_call>
Done`;
    const segments = parseMessageSegments(text);
    
    const toolSegments = segments.filter(s => s.type === 'tool');
    expect(toolSegments.length).toBe(2);
    expect(toolSegments[0]).toMatchObject({ toolName: 'list' });
    expect(toolSegments[1]).toMatchObject({ toolName: 'read' });
  });

  it('handles tool call at start of text', () => {
    const text = `<tool_call>{"name": "active_file"}</tool_call>
Response after`;
    const segments = parseMessageSegments(text);
    expect(segments[0]).toMatchObject({ type: 'tool', toolName: 'active_file' });
  });

  it('handles tool call at end of text', () => {
    const text = `Before tool
<tool_call>{"name": "list", "arguments": {"prefix": "docs/"}}</tool_call>`;
    const segments = parseMessageSegments(text);
    expect(segments[segments.length - 1]).toMatchObject({ type: 'tool', toolName: 'list' });
  });

  it('handles empty/whitespace text segments', () => {
    const text = `<tool_call>{"name": "read", "arguments": {"path": "a.md"}}</tool_call>`;
    const segments = parseMessageSegments(text);
    // Should just have the tool segment, no empty text segments
    const nonEmptySegments = segments.filter(s => 
      s.type === 'tool' || (s.type === 'text' && s.content.trim())
    );
    expect(nonEmptySegments.length).toBe(1);
    expect(nonEmptySegments[0]).toMatchObject({ type: 'tool' });
  });

  it('preserves text content between tool calls', () => {
    const text = `Intro
<tool_call>{"name": "list", "arguments": {}}</tool_call>
Middle content here
<tool_call>{"name": "read", "arguments": {"path": "x"}}</tool_call>
Outro`;
    const segments = parseMessageSegments(text);
    
    const textSegments = segments.filter(s => s.type === 'text');
    const contents = textSegments.map(s => s.type === 'text' ? s.content.trim() : '').filter(Boolean);
    expect(contents).toContain('Intro');
    expect(contents).toContain('Middle content here');
    expect(contents).toContain('Outro');
  });
});
