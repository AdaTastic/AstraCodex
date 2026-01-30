import { describe, expect, it } from 'vitest';
import { buildConversationHistory } from '../conversationHistory';
import type { Message } from '../types';

describe('conversationHistory', () => {
  it('includes tool_calls in assistant messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Read the HABs file' },
      { 
        role: 'assistant', 
        content: '', 
        tool_calls: [{ name: 'read', arguments: { path: 'Harmful Algal Blooms (HABs).md' } }] 
      },
      { role: 'user', content: 'summarize' }
    ];

    const history = buildConversationHistory(messages, 9999, { excludeLatestUserMessage: true });
    const parsed = JSON.parse(history);
    
    // Should include tool_calls in assistant message
    expect(parsed[0].content).toBe('Read the HABs file');
    expect(parsed[1].tool_calls).toBeDefined();
    expect(parsed[1].tool_calls[0].name).toBe('read');
  });

  it('uses content field for text', () => {
    const messages: Message[] = [
      { role: 'assistant', content: 'Here is the summary' }
    ];

    const history = buildConversationHistory(messages, 9999);
    const parsed = JSON.parse(history);
    
    expect(parsed[0].content).toBe('Here is the summary');
  });

  it('outputs OpenAI-compatible JSON format', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ];

    const history = buildConversationHistory(messages, 9999);
    const parsed = JSON.parse(history);
    
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(parsed[1].role).toBe('assistant');
    expect(parsed[1].content).toBe('Hi there');
  });

  it('trims from the oldest when budget is limited', () => {
    const messages: Message[] = [
      { role: 'user', content: 'First user message' },
      { role: 'assistant', content: 'First assistant reply' },
      { role: 'user', content: 'Second user message' }
    ];

    const history = buildConversationHistory(messages, 9999, { excludeLatestUserMessage: true });
    const parsed = JSON.parse(history);
    
    expect(parsed).toHaveLength(2);
    expect(parsed[0].content).toBe('First user message');
    expect(parsed[1].content).toBe('First assistant reply');
  });

  it('returns empty array when budget is zero', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' }
    ];

    const history = buildConversationHistory(messages, 0);
    expect(history).toBe('[]');
  });

  it('includes tool role messages with tool_call_id', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Read file' },
      { 
        role: 'assistant', 
        content: '', 
        tool_calls: [{ name: 'read', arguments: { path: 'test.md' } }] 
      },
      {
        role: 'tool',
        content: '# Test Content',
        tool_result: '# Test Content',
        tool_call_id: '0-read'
      }
    ];

    const history = buildConversationHistory(messages, 9999);
    const parsed = JSON.parse(history);
    
    expect(parsed).toHaveLength(3);
    expect(parsed[2].role).toBe('tool');
    expect(parsed[2].tool_call_id).toBe('0-read');
  });
});
