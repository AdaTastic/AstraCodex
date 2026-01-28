import type { AstraCodexSettings } from './settings';
import type { Message, ParsedHeader } from './types';
import type { ChatRecord } from './chatStore';

export type ChatStateSnapshot = {
  settings: AstraCodexSettings;
  state: { header: ParsedHeader | null; state: string };
  messages: Message[];
};

export const createChatRecord = (record: ChatRecord): ChatRecord => {
  return record;
};

export const restoreChatState = (record: ChatRecord): ChatStateSnapshot => {
  return {
    settings: record.settings,
    state: record.state,
    messages: record.messages
  };
};