import { describe, it, expect } from 'vitest';
import type { Message, ToolCallInfo } from '../types';

describe('Message type', () => {
  it('should have content field instead of text', () => {
    const message: Message = {
      role: 'user',
      content: 'Hello'
    };
    expect(message.content).toBe('Hello');
    // @ts-expect-error - text should not exist
    expect(message.text).toBeUndefined();
  });

  it('should have tool_calls field in snake_case', () => {
    const toolCalls: ToolCallInfo[] = [
      { name: 'read', arguments: { path: 'file.md' } }
    ];
    const message: Message = {
      role: 'assistant',
      content: 'Reading file',
      tool_calls: toolCalls
    };
    expect(message.tool_calls).toEqual(toolCalls);
    // @ts-expect-error - toolCalls should not exist
    expect(message.toolCalls).toBeUndefined();
  });

  it('should have tool_result field in snake_case', () => {
    const message: Message = {
      role: 'tool',
      content: 'file content here',
      tool_result: { ok: true }
    };
    expect(message.tool_result).toEqual({ ok: true });
    // @ts-expect-error - toolResult should not exist
    expect(message.toolResult).toBeUndefined();
  });

  it('should have tool_call_id field in snake_case', () => {
    const message: Message = {
      role: 'tool',
      content: 'result',
      tool_call_id: '0-read'
    };
    expect(message.tool_call_id).toBe('0-read');
    // @ts-expect-error - toolCallId should not exist
    expect(message.toolCallId).toBeUndefined();
  });

  it('should NOT have deprecated fields', () => {
    const message: Message = {
      role: 'assistant',
      content: 'test'
    };
    // These fields should not exist on the type
    // @ts-expect-error - rawText removed
    expect(message.rawText).toBeUndefined();
    // @ts-expect-error - activityLine removed
    expect(message.activityLine).toBeUndefined();
    // @ts-expect-error - header removed
    expect(message.header).toBeUndefined();
    // @ts-expect-error - headerExpanded removed
    expect(message.headerExpanded).toBeUndefined();
    // @ts-expect-error - thinkExpanded removed
    expect(message.thinkExpanded).toBeUndefined();
  });

  it('should still have think field for reasoning', () => {
    const message: Message = {
      role: 'assistant',
      content: 'Here is the answer',
      think: 'Let me reason through this...'
    };
    expect(message.think).toBe('Let me reason through this...');
  });

  it('should support segments field for agentic display', () => {
    const message: Message = {
      role: 'assistant',
      content: 'test',
      segments: [
        { type: 'text', content: 'Hello' },
        { type: 'tool', activity: 'reading: file.md', toolName: 'read' }
      ]
    };
    expect(message.segments).toHaveLength(2);
  });
});

describe('ToolCallInfo type', () => {
  it('should have name and arguments fields', () => {
    const toolCall: ToolCallInfo = {
      name: 'list',
      arguments: { prefix: 'docs/' }
    };
    expect(toolCall.name).toBe('list');
    expect(toolCall.arguments).toEqual({ prefix: 'docs/' });
  });
});
