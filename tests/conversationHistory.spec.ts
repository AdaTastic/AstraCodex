import { describe, expect, it } from 'vitest';
import { buildConversationHistory } from '../conversationHistory';

describe('conversationHistory', () => {
  it('trims from the oldest and can exclude latest user message', () => {
    const messages: any[] = [
      { role: 'user', text: 'First user message' },
      { role: 'assistant', text: 'First assistant reply' },
      { role: 'user', text: 'Second user message' }
    ];

    const history = buildConversationHistory(messages as any, 999, { excludeLatestUserMessage: true });
    expect(history).toContain('User: First user message');
    expect(history).toContain('Assistant: First assistant reply');
    expect(history).not.toContain('Second user message');

    const tiny = buildConversationHistory(messages as any, 10);
    // tiny budget should drop everything.
    expect(tiny).toBe('');
  });
});
