export interface AstraCodexSettings {
  baseUrl: string;
  model: string;
  includeActiveNote: boolean;
  maxContextChars: number;
  maxMemoryChars: number;
  contextSliderValue: number; // New property for the context slider value
}

export const DEFAULT_SETTINGS: AstraCodexSettings = {
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:32b-instruct',
  includeActiveNote: false,
  maxContextChars: 8000,
  maxMemoryChars: 2000,
  contextSliderValue: 50 // Default value for the context slider
};

export const defaultSettings = (): AstraCodexSettings => ({ ...DEFAULT_SETTINGS });

export const mergeSettings = (overrides?: Partial<AstraCodexSettings>): AstraCodexSettings => {
  return { ...DEFAULT_SETTINGS, ...(overrides ?? {}) };
};