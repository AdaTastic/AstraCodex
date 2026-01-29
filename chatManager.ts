import type { Message } from './types';
import type { AstraCodexSettings } from './settings';
import type { ChatStore, ChatMeta, ChatRecord } from './chatStore';
import { mergeChatSettings, restoreChatState } from './chatSession';
import { deriveChatTitle } from './chatTitle';

export interface ChatManagerState {
  activeChatId: string | null;
  chatIndex: ChatMeta[];
  messages: Message[];
  settings: AstraCodexSettings;
  hasNamedActiveChat: boolean;
  lastDocument: { path: string; content: string } | null;
}

/**
 * Loads the chat index and ensures at least one chat exists.
 */
export const loadChatIndex = async (
  chatStore: ChatStore,
  settings: AstraCodexSettings
): Promise<{ index: ChatMeta[]; firstChatId: string }> => {
  let index = await chatStore.loadIndex();
  
  if (index.length === 0) {
    const record = chatStore.createChat('New Chat', settings);
    await chatStore.saveChat(record);
    index = [record.meta];
  }
  
  return { index, firstChatId: index[0].id };
};

/**
 * Loads and restores a chat by ID.
 */
export const loadChat = async (
  chatStore: ChatStore,
  chatId: string,
  currentSettings: AstraCodexSettings
): Promise<{
  record: ChatRecord;
  settings: AstraCodexSettings;
  messages: Message[];
  lastDocument: { path: string; content: string } | null;
  state: { header: any; state: string };
  hasNamedActiveChat: boolean;
}> => {
  const record = await chatStore.loadChat(chatId);
  const restored = restoreChatState(record);
  
  // Merge per-chat settings but keep global model/baseUrl from current settings
  const mergedSettings = mergeChatSettings(currentSettings, restored.settings);
  const hasNamedActiveChat = 
    (record.meta.title ?? '').trim() !== '' && 
    record.meta.title !== 'New Chat';
  
  return {
    record,
    settings: mergedSettings,
    messages: restored.messages,
    lastDocument: restored.lastDocument ?? null,
    state: restored.state,
    hasNamedActiveChat
  };
};

/**
 * Creates a new chat and returns the updated state.
 */
export const createNewChat = async (
  chatStore: ChatStore,
  settings: AstraCodexSettings
): Promise<{ index: ChatMeta[]; newChatId: string }> => {
  const record = chatStore.createChat('New Chat', settings);
  await chatStore.saveChat(record);
  const index = await chatStore.loadIndex();
  return { index, newChatId: record.meta.id };
};

/**
 * Deletes a chat and returns the updated state.
 */
export const deleteChat = async (
  chatStore: ChatStore,
  chatId: string
): Promise<ChatMeta[]> => {
  await chatStore.deleteChat(chatId);
  return chatStore.loadIndex();
};

/**
 * Saves the current chat state.
 */
export const saveChat = async (
  chatStore: ChatStore,
  state: {
    activeChatId: string;
    chatIndex: ChatMeta[];
    settings: AstraCodexSettings;
    parsedHeader: any;
    stateMachineState: string;
    messages: Message[];
    lastDocument: { path: string; content: string } | null;
  }
): Promise<ChatMeta[]> => {
  const meta = state.chatIndex.find((chat) => chat.id === state.activeChatId);
  if (!meta) return state.chatIndex;

  const record: ChatRecord = {
    meta: {
      id: state.activeChatId,
      title: meta.title ?? 'Chat',
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    settings: state.settings,
    state: { header: state.parsedHeader, state: state.stateMachineState },
    messages: state.messages,
    lastDocument: state.lastDocument
  };
  
  await chatStore.saveChat(record);
  return chatStore.loadIndex();
};

/**
 * Ensures the chat has a meaningful title based on first user message.
 */
export const ensureChatNamed = async (
  chatStore: ChatStore,
  chatIndex: ChatMeta[],
  activeChatId: string | null,
  hasNamedActiveChat: boolean,
  firstUserMessage: string
): Promise<{ chatIndex: ChatMeta[]; hasNamedActiveChat: boolean }> => {
  if (!activeChatId) return { chatIndex, hasNamedActiveChat };
  if (hasNamedActiveChat) return { chatIndex, hasNamedActiveChat };

  const title = deriveChatTitle(firstUserMessage, 50);
  const meta = chatIndex.find((c) => c.id === activeChatId);
  if (!meta) return { chatIndex, hasNamedActiveChat };
  
  if (meta.title === title) {
    return { chatIndex, hasNamedActiveChat: true };
  }
  
  meta.title = title;
  meta.updatedAt = new Date().toISOString();
  await chatStore.saveIndex(chatIndex);
  
  return { chatIndex, hasNamedActiveChat: true };
};

/**
 * Renders chat options to a select element.
 */
export const renderChatOptions = (
  chatSelect: HTMLSelectElement,
  chatIndex: ChatMeta[],
  activeChatId: string | null
): void => {
  (chatSelect as any).empty();
  chatIndex.forEach((chat) => {
    const option = chatSelect.createEl('option', { text: chat.title, value: chat.id });
    if (chat.id === activeChatId) {
      option.selected = true;
    }
  });
};
