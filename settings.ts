export interface AstraCodexSettings {
  baseUrl: string;
  model: string;
  includeActiveNote: boolean;
  maxContextChars: number;
  maxMemoryChars: number;
  // DEPRECATED: contextSliderValue is unused but kept for backwards compatibility with saved chats
  contextSliderValue?: number;
}

export const DEFAULT_SETTINGS: AstraCodexSettings = {
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:32b-instruct',
  includeActiveNote: false,
  maxContextChars: 32000, // Increased default to support larger context windows (32K models)
  maxMemoryChars: 2000,
  contextSliderValue: 50 // Deprecated but kept for backwards compatibility
};

export const defaultSettings = (): AstraCodexSettings => ({ ...DEFAULT_SETTINGS });

export const mergeSettings = (overrides?: Partial<AstraCodexSettings>): AstraCodexSettings => {
  return { ...DEFAULT_SETTINGS, ...(overrides ?? {}) };
};
