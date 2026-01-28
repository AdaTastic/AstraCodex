import { describe, expect, it } from 'vitest';
import { createChatRecord, restoreChatState } from '../chatSession';

describe('chatSession', () => {
  it('serializes and restores chat state', () => {
    const record = createChatRecord({
      meta: { id: 'chat-1', title: 'Chat', createdAt: 'now', updatedAt: 'now' },
      settings: { baseUrl: 'url', model: 'model', includeActiveNote: false, maxContextChars: 10, maxMemoryChars: 5 },
      state: { header: null, state: 'idle' },
      messages: [{ role: 'user', text: 'hi' }]
    });

    const restored = restoreChatState(record);

    expect(restored.messages[0].text).toBe('hi');
    expect(restored.settings.model).toBe('model');
    expect(restored.state.state).toBe('idle');
  });
});