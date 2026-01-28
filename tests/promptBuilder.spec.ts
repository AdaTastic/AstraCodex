import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../promptBuilder';
import type { CoreRules } from '../ruleManager';
import type { AstraCodexSettings } from '../settings';

const coreRules: CoreRules = {
  charter: 'CHARTER',
  states: 'STATES',
  voice: 'VOICE'
};

const settings: AstraCodexSettings = {
  baseUrl: 'http://localhost:11434',
  model: 'model',
  includeActiveNote: false,
  maxContextChars: 100,
  maxMemoryChars: 50,
  contextSliderValue: 50
};

describe('PromptBuilder', () => {
  it('includes required sections and user message', () => {
    const prompt = buildPrompt({
      userMessage: 'hello',
      settings: { ...settings, maxContextChars: 500 },
      coreRules
    });

    expect(prompt).toContain('STATE:');
    expect(prompt).toContain('NEEDS_CONFIRMATION:');
    expect(prompt).toContain('PROPOSED_ACTION:');
    expect(prompt).toContain('CHARTER');
    expect(prompt).toContain('STATES');
    expect(prompt).toContain('VOICE');
    expect(prompt).toContain('User Request:');
    expect(prompt).toContain('hello');
  });

  it('truncates memory to maxMemoryChars', () => {
    const memory = '1234567890'.repeat(10);
    const prompt = buildPrompt({
      userMessage: 'hello',
      settings: { ...settings, maxContextChars: 500, contextSliderValue: 100 },
      coreRules,
      memory
    });

    const memoryLine = prompt
      .split('\n')
      .find((line) => line.startsWith('Memory:'));
    expect(memoryLine?.length).toBeLessThanOrEqual(settings.maxMemoryChars + 50);
  });

  it('truncates total context to maxContextChars', () => {
    const longRules = { ...coreRules, charter: 'A'.repeat(500) };
    const prompt = buildPrompt({
      userMessage: 'hello',
      settings: { ...settings, maxContextChars: 120, contextSliderValue: 12 },
      coreRules: longRules
    });

    expect(prompt.length).toBeLessThanOrEqual(120);
  });

  it('includes tool catalog when tools are provided', () => {
    const prompt = buildPrompt({
      userMessage: 'hello',
      settings: { ...settings, maxContextChars: 500 },
      coreRules,
      tools: [
        { name: 'read', description: 'Read a file', params: { path: 'string' } }
      ]
    });

    expect(prompt).toContain('Tools:');
    expect(prompt).toContain('read');
    expect(prompt).toContain('Read a file');
  });
});