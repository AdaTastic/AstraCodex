import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings } from '../settings';

describe('settings defaults', () => {
  it('returns defaults with expected values', () => {
    const defaults = defaultSettings();
    expect(defaults.baseUrl).toBe('http://127.0.0.1:11434');
    expect(defaults.model).toBe('qwen2.5:32b-instruct');
    expect(defaults.includeActiveNote).toBe(false);
    expect(defaults.maxContextChars).toBe(32000);
    expect(defaults.maxMemoryChars).toBe(2000);
  });

  it('merges overrides without losing defaults', () => {
    const merged = mergeSettings({ model: 'test-model', maxContextChars: 5000 });
    expect(merged.model).toBe('test-model');
    expect(merged.maxContextChars).toBe(5000);
    expect(merged.baseUrl).toBe('http://127.0.0.1:11434');
  });
});
