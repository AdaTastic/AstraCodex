import type { AstraCodexSettings } from './settings';
import { mergeSettings } from './settings';
import type { Message, ParsedHeader } from './types';
import type { ChatRecord } from './chatStore';

export type ChatStateSnapshot = {
  settings: AstraCodexSettings;
  state: { header: ParsedHeader | null; state: string };
  messages: Message[];
  lastDocument?: { path: string; content: string } | null;
};

// Global model/baseUrl/maxContextChars should not be overridden by per-chat settings.
// This prevents old chats with small context limits from ignoring user's updated settings.
export const mergeChatSettings = (globalSettings: AstraCodexSettings, chatSettings?: Partial<AstraCodexSettings>): AstraCodexSettings => {
  const defaults = mergeSettings();
  const merged = mergeSettings(chatSettings as Partial<AstraCodexSettings>);

  return {
    ...merged,
    // enforce global model/baseUrl/maxContextChars - user's current settings always win
    baseUrl: globalSettings.baseUrl,
    model: globalSettings.model,
    maxContextChars: globalSettings.maxContextChars || defaults.maxContextChars,

    // treat 0 as missing for maxMemoryChars
    maxMemoryChars: merged.maxMemoryChars > 0 ? merged.maxMemoryChars : globalSettings.maxMemoryChars || defaults.maxMemoryChars,

    // allow includeActiveNote to follow global unless explicitly set in chat
    includeActiveNote:
      typeof (chatSettings as any)?.includeActiveNote === 'boolean'
        ? (chatSettings as any).includeActiveNote
        : globalSettings.includeActiveNote,
    
    // contextSliderValue is deprecated but kept for backwards compatibility
    contextSliderValue: defaults.contextSliderValue
  };
};

export const createChatRecord = (record: ChatRecord): ChatRecord => {
  return record;
};

export const restoreChatState = (record: ChatRecord): ChatStateSnapshot => {
  // Backwards compatible merge for older/broken chat files.
  // NOTE: This restore uses DEFAULT_SETTINGS only. The view layer will re-merge
  // with *global plugin settings* (and enforce global model/baseUrl).
  const defaults = mergeSettings();
  const merged = mergeSettings(record.settings as Partial<AstraCodexSettings>);

  const settings: AstraCodexSettings = {
    ...merged,
    baseUrl: merged.baseUrl && merged.baseUrl.trim() ? merged.baseUrl : defaults.baseUrl,
    model: merged.model && merged.model.trim() ? merged.model : defaults.model,
    maxContextChars: merged.maxContextChars > 0 ? merged.maxContextChars : defaults.maxContextChars,
    maxMemoryChars: merged.maxMemoryChars > 0 ? merged.maxMemoryChars : defaults.maxMemoryChars,
    // contextSliderValue is deprecated, just use default
    contextSliderValue: defaults.contextSliderValue,
    includeActiveNote:
      typeof (record.settings as any)?.includeActiveNote === 'boolean'
        ? (record.settings as any).includeActiveNote
        : defaults.includeActiveNote
  };

  return {
    settings,
    state: record.state,
    messages: record.messages,
    lastDocument: record.lastDocument ?? null
  };
};
