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

    expect(prompt).toContain('You MUST respond with a header in the format:');
    expect(prompt).toContain('STATE:');
    expect(prompt).toContain('NEEDS_CONFIRMATION:');
    expect(prompt).not.toContain('PROPOSED_ACTION:');
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

  it('does not depend on contextSliderValue for truncation', () => {
    const prompt = buildPrompt({
      userMessage: 'hello',
      settings: { ...settings, maxContextChars: 120, contextSliderValue: 1 },
      coreRules
    });

    expect(prompt.length).toBeLessThanOrEqual(120);
    expect(prompt).toContain('User Request:');
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

  it('includes conversation history when provided', () => {
    const prompt = buildPrompt({
      userMessage: 'Follow-up question',
      settings: { ...settings, maxContextChars: 500 },
      coreRules,
      history: 'User: Hi\nAssistant: Hello'
    });

    expect(prompt).toContain('Conversation History:');
    expect(prompt).toContain('User: Hi');
    expect(prompt).toContain('Assistant: Hello');
    expect(prompt).toContain('User Request:');
    expect(prompt).toContain('Follow-up question');
  });

  it('includes last document context when provided', () => {
    const prompt = buildPrompt({
      userMessage: 'Summarize it',
      settings: { ...settings, maxContextChars: 1000 },
      coreRules,
      lastDocument: { path: 'Harmful Algal Blooms (HABs).md', content: 'DOC CONTENT HERE' }
    });

    expect(prompt).toContain('Last Document Context (Harmful Algal Blooms (HABs).md):');
    expect(prompt).toContain('DOC CONTENT HERE');
  });

  it('preserves the latest user request when context is truncated', () => {
    const prompt = buildPrompt({
      userMessage: 'LATEST QUESTION',
      settings: { ...settings, contextSliderValue: 20 },
      coreRules: { ...coreRules, charter: 'A'.repeat(500) },
      memory: 'B'.repeat(500)
    });

    expect(prompt).toContain('User Request:');
    expect(prompt).toContain('LATEST QUESTION');
  });
});