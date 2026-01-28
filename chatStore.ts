import type { AstraCodexSettings } from './settings';
import { defaultSettings } from './settings';
import type { Message, ParsedHeader } from './types';

export type ChatMeta = { id: string; title: string; createdAt: string; updatedAt: string };
export type ChatRecord = {
  meta: ChatMeta;
  settings: AstraCodexSettings;
  state: { header: ParsedHeader | null; state: string };
  messages: Message[];
  lastDocument?: { path: string; content: string } | null;
};

type VaultAdapter = {
  read: (path: string) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  list: (prefix: string) => Promise<string[]>;
};

const CHAT_DIR = 'AstraCodex/Chats';
const INDEX_PATH = `${CHAT_DIR}/index.json`;

export class ChatStore {
  private adapter: VaultAdapter;

  constructor(adapter: VaultAdapter) {
    this.adapter = adapter;
  }

  createChat(title: string, settings: AstraCodexSettings): ChatRecord {
    const now = new Date().toISOString();
    const id = `chat-${now.replace(/[:.]/g, '-')}`;
    return {
      meta: { id, title, createdAt: now, updatedAt: now },
      settings,
      state: { header: null, state: 'idle' },
      messages: []
      ,
      lastDocument: null
    };
  }

  async loadIndex(): Promise<ChatMeta[]> {
    if (!(await this.adapter.exists(INDEX_PATH))) {
      return [];
    }
    const raw = await this.adapter.read(INDEX_PATH);
    return JSON.parse(raw) as ChatMeta[];
  }

  async saveIndex(index: ChatMeta[]): Promise<void> {
    await this.adapter.write(INDEX_PATH, JSON.stringify(index, null, 2));
  }

  async saveChat(record: ChatRecord): Promise<void> {
    const index = await this.loadIndex();
    const updated = index.filter((entry) => entry.id !== record.meta.id);
    updated.push(record.meta);
    await this.saveIndex(updated);
    await this.adapter.write(this.chatPath(record.meta.id), JSON.stringify(record, null, 2));
  }

  async loadChat(id: string): Promise<ChatRecord> {
    const raw = await this.adapter.read(this.chatPath(id));
    return JSON.parse(raw) as ChatRecord;
  }

  async deleteChat(id: string): Promise<void> {
    await this.adapter.remove(this.chatPath(id));
    const index = await this.loadIndex();
    await this.saveIndex(index.filter((entry) => entry.id !== id));
  }

  private chatPath(id: string): string {
    return `${CHAT_DIR}/${id}.json`;
  }
}