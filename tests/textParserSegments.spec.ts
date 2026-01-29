import { describe, expect, it } from 'vitest';
import { parseMessageSegments, deriveState } from '../textParser';

describe('parseMessageSegments', () => {
  it('returns single text segment for text-only input', () => {
    const input = 'Hello, how can I help you?';
    const segments = parseMessageSegments(input);
    
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ type: 'text', content: 'Hello, how can I help you?' });
  });

  it('splits text at tool block boundaries', () => {
    const input = `I'll search for that file.
\`\`\`tool
{"name":"list","args":{"prefix":""}}
\`\`\`
Found several files.`;
    
    const segments = parseMessageSegments(input);
    
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: 'text', content: "I'll search for that file." });
    expect(segments[1]).toMatchObject({ type: 'tool', toolName: 'list' });
    expect(segments[2]).toEqual({ type: 'text', content: 'Found several files.' });
  });

  it('handles multiple tool blocks', () => {
    const input = `Searching...
\`\`\`tool
{"name":"list","args":{}}
\`\`\`
Found it! Let me read it.
\`\`\`tool
{"name":"read","args":{"path":"test.md"}}
\`\`\`
Here's the content.`;
    
    const segments = parseMessageSegments(input);
    
    expect(segments).toHaveLength(5);
    expect(segments[0]).toMatchObject({ type: 'text' });
    expect(segments[1]).toMatchObject({ type: 'tool', toolName: 'list' });
    expect(segments[2]).toMatchObject({ type: 'text', content: "Found it! Let me read it." });
    expect(segments[3]).toMatchObject({ type: 'tool', toolName: 'read' });
    expect(segments[4]).toMatchObject({ type: 'text', content: "Here's the content." });
  });

  it('generates correct activity lines', () => {
    const input = `\`\`\`tool
{"name":"read","args":{"path":"notes/test.md"}}
\`\`\``;
    
    const segments = parseMessageSegments(input);
    
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ 
      type: 'tool', 
      toolName: 'read',
      activity: 'reading: notes/test.md'
    });
  });

  it('strips leaked headers from text segments', () => {
    const input = `STATE: thinking
NEEDS_CONFIRMATION: false
Here's the actual response.`;
    
    const segments = parseMessageSegments(input);
    
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('text');
    expect((segments[0] as any).content).not.toContain('STATE:');
    expect((segments[0] as any).content).toContain("Here's the actual response.");
  });

  it('strips think blocks from text segments', () => {
    const input = `<think>Planning what to do...</think>
Here's my response.`;
    
    const segments = parseMessageSegments(input);
    
    expect(segments).toHaveLength(1);
    expect((segments[0] as any).content).not.toContain('think');
    expect((segments[0] as any).content).toContain("Here's my response.");
  });

  it('handles tool block with no surrounding text', () => {
    const input = `\`\`\`tool
{"name":"list","args":{}}
\`\`\``;
    
    const segments = parseMessageSegments(input);
    
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: 'tool', toolName: 'list' });
  });

  it('handles invalid JSON gracefully', () => {
    const input = `\`\`\`tool
{invalid json}
\`\`\`
Some text.`;
    
    const segments = parseMessageSegments(input);
    
    // Invalid tool block is skipped, only text remains
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ type: 'text', content: 'Some text.' });
  });
});

describe('deriveState', () => {
  it('returns idle when nothing is happening', () => {
    const state = deriveState({
      isStreaming: false,
      requiresConfirmation: false,
      hasError: false
    });
    expect(state).toBe('idle');
  });

  it('returns thinking when streaming', () => {
    const state = deriveState({
      isStreaming: true,
      requiresConfirmation: false,
      hasError: false
    });
    expect(state).toBe('thinking');
  });

  it('returns reading for read tool', () => {
    const state = deriveState({
      isStreaming: false,
      toolCall: { name: 'read', args: { path: 'test.md' } },
      requiresConfirmation: false,
      hasError: false
    });
    expect(state).toBe('reading');
  });

  it('returns searching for list tool', () => {
    const state = deriveState({
      isStreaming: false,
      toolCall: { name: 'list', args: {} },
      requiresConfirmation: false,
      hasError: false
    });
    expect(state).toBe('searching');
  });

  it('returns writing for write tool', () => {
    const state = deriveState({
      isStreaming: false,
      toolCall: { name: 'write', args: {} },
      requiresConfirmation: false,
      hasError: false
    });
    expect(state).toBe('writing');
  });

  it('returns awaiting_confirmation when confirmation needed', () => {
    const state = deriveState({
      isStreaming: false,
      toolCall: { name: 'write', args: {} },
      requiresConfirmation: true,
      hasError: false
    });
    expect(state).toBe('awaiting_confirmation');
  });

  it('returns error when hasError is true', () => {
    const state = deriveState({
      isStreaming: true,
      toolCall: { name: 'read', args: {} },
      requiresConfirmation: false,
      hasError: true
    });
    expect(state).toBe('error');
  });

  it('prioritizes error over other states', () => {
    const state = deriveState({
      isStreaming: true,
      toolCall: { name: 'write', args: {} },
      requiresConfirmation: true,
      hasError: true
    });
    expect(state).toBe('error');
  });

  it('prioritizes awaiting_confirmation over tool state', () => {
    const state = deriveState({
      isStreaming: false,
      toolCall: { name: 'write', args: {} },
      requiresConfirmation: true,
      hasError: false
    });
    expect(state).toBe('awaiting_confirmation');
  });
});
