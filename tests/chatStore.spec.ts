import { describe, expect, it } from 'vitest';
import { ChatStore } from '../chatStore';
import { DEFAULT_SETTINGS } from '../settings';

const adapter = () => {
  const files = new Map<string, string>();
  return {
    read: async (path: string) => {
      const value = files.get(path);
      if (!value) throw new Error('missing');
      return value;
    },
    write: async (path: string, content: string) => {
      files.set(path, content);
    },
    remove: async (path: string) => {
      files.delete(path);
    },
    exists: async (path: string) => files.has(path),
    list: async (prefix: string) => {
      return Array.from(files.keys()).filter((key) => key.startsWith(prefix));
    }
  };
};

describe('ChatStore', () => {
  it('initializes new chats with the provided settings', async () => {
    const store = new ChatStore(adapter());
    const chat = store.createChat('Defaults Chat', DEFAULT_SETTINGS);

    expect(chat.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('creates, saves, loads, and deletes chats', async () => {
    const store = new ChatStore(adapter());

    const chat = store.createChat('Test Chat', DEFAULT_SETTINGS);
    await store.saveChat(chat);

    const loaded = await store.loadChat(chat.meta.id);
    expect(loaded.meta.title).toBe('Test Chat');

    await store.deleteChat(chat.meta.id);
    await expect(store.loadChat(chat.meta.id)).rejects.toThrow();
  });

  it('updates index when saving chats', async () => {
    const store = new ChatStore(adapter());

    const chat = store.createChat('Index Chat', DEFAULT_SETTINGS);
    await store.saveChat(chat);

    const index = await store.loadIndex();
    expect(index[0].title).toBe('Index Chat');
  });
});