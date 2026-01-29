import { describe, expect, it } from 'vitest';
import { buildConversationHistory } from '../conversationHistory';

describe('conversationHistory', () => {
  it('falls back to activityLine when text is empty', () => {
    const messages: any[] = [
      { role: 'user', text: 'Read the HABs file' },
      { role: 'assistant', text: '', activityLine: 'reading: Harmful Algal Blooms (HABs).md' },
      { role: 'user', text: 'summarize' }
    ];

    const history = buildConversationHistory(messages as any, 999, { excludeLatestUserMessage: true });
    
    // Should include the activityLine as fallback since text was empty
    expect(history).toContain('User: Read the HABs file');
    expect(history).toContain('reading: Harmful Algal Blooms (HABs).md');
  });

  it('prefers text over activityLine when both exist', () => {
    const messages: any[] = [
      { role: 'assistant', text: 'Here is the summary', activityLine: 'reading: file.md' }
    ];

    const history = buildConversationHistory(messages as any, 999);
    
    expect(history).toContain('Here is the summary');
    expect(history).not.toContain('reading: file.md');
  });

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
