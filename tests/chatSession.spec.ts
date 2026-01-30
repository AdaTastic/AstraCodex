import { describe, expect, it } from 'vitest';
import { createChatRecord, mergeChatSettings, restoreChatState } from '../chatSession';
import { DEFAULT_SETTINGS } from '../settings';

describe('chatSession', () => {
  it('keeps global model/baseUrl/maxContextChars when merging chat settings', () => {
    // Global settings should ALWAYS win for model, baseUrl, AND maxContextChars
    // This prevents old chats with small maxContextChars from overriding new global settings
    const global = { ...DEFAULT_SETTINGS, baseUrl: 'GLOBAL_URL', model: 'GLOBAL_MODEL', maxContextChars: 120000 };
    const merged = mergeChatSettings(global, { baseUrl: 'CHAT_URL', model: 'CHAT_MODEL', maxContextChars: 8000 } as any);

    expect(merged.baseUrl).toBe('GLOBAL_URL');
    expect(merged.model).toBe('GLOBAL_MODEL');
    expect(merged.maxContextChars).toBe(120000); // Global should win!
  });

  it('merges empty/missing settings with defaults on restore', () => {
    const record = createChatRecord({
      meta: { id: 'chat-1', title: 'Chat', createdAt: 'now', updatedAt: 'now' },
      // simulate older/broken chat files
      settings: { baseUrl: '', model: '', includeActiveNote: false, maxContextChars: 0, maxMemoryChars: 0 } as any,
      state: { header: null, state: 'idle' },
      messages: [{ role: 'user', text: 'hi' }]
    } as any);

    const restored = restoreChatState(record as any);

    expect(restored.settings.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl);
    expect(restored.settings.model).toBe(DEFAULT_SETTINGS.model);
    expect(restored.settings.maxContextChars).toBe(DEFAULT_SETTINGS.maxContextChars);
    expect(restored.settings.maxMemoryChars).toBe(DEFAULT_SETTINGS.maxMemoryChars);
    expect((restored.settings as any).contextSliderValue).toBe(DEFAULT_SETTINGS.contextSliderValue);
  });

  it('serializes and restores chat state', () => {
    const record = createChatRecord({
      meta: { id: 'chat-1', title: 'Chat', createdAt: 'now', updatedAt: 'now' },
      settings: { ...DEFAULT_SETTINGS, baseUrl: 'url', model: 'model', includeActiveNote: false, maxContextChars: 10, maxMemoryChars: 5 },
      state: { header: null, state: 'idle' },
      // Use old format to test migration (cast to any to simulate old data)
      messages: [{ role: 'user', text: 'hi' } as any]
    });

    const restored = restoreChatState(record);

    // Migration converts text -> content
    expect(restored.messages[0].content).toBe('hi');
    expect(restored.settings.model).toBe('model');
    expect(restored.state.state).toBe('idle');
  });

  it('migrates old message format (text -> content)', () => {
    const record = createChatRecord({
      meta: { id: 'chat-1', title: 'Test', createdAt: 'now', updatedAt: 'now' },
      settings: DEFAULT_SETTINGS,
      state: { header: null, state: 'idle' },
      // Old format messages (cast to any to simulate old data)
      messages: [
        { role: 'user', text: 'old format' } as any,
        { role: 'assistant', text: 'response', toolCalls: [{ name: 'read', arguments: { path: 'test.md' } }] } as any
      ]
    });

    const restored = restoreChatState(record);

    expect(restored.messages[0].content).toBe('old format');
    expect(restored.messages[1].content).toBe('response');
    expect(restored.messages[1].tool_calls?.[0].name).toBe('read');
  });
});
