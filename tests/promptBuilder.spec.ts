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
      // The header contract now includes a tool-call schema example, so reserve enough room.
      settings: { ...settings, maxContextChars: 2000 },
      coreRules
    });

    // New simplified format - no STATE/NEEDS_CONFIRMATION/FINAL headers
    expect(prompt).toContain('RESPONSE FORMAT:');
    expect(prompt).toContain('<think>');
    expect(prompt).toContain('</think>');
    expect(prompt).toContain('TOOL CALLS:');
    expect(prompt).toContain('```tool');
    expect(prompt).toContain('FILE READING GUIDANCE:');
    // Still includes core rules
    expect(prompt).toContain('CHARTER');
    expect(prompt).toContain('STATES');
    expect(prompt).toContain('VOICE');
    expect(prompt).toContain('User Request:');
    expect(prompt).toContain('hello');
    // Should NOT have old header requirements
    expect(prompt).not.toContain('You MUST respond with a header in the format:');
    expect(prompt).not.toContain('FINAL:');
  });

  it('truncates memory to maxMemoryChars', () => {
    const memory = '1234567890'.repeat(10);
    const prompt = buildPrompt({
      userMessage: 'hello',
      settings: { ...settings, maxContextChars: 2000, contextSliderValue: 100 },
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
      settings: { ...settings, maxContextChars: 2000 },
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
      settings: { ...settings, maxContextChars: 2000 },
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
      settings: { ...settings, maxContextChars: 2000 },
      coreRules,
      lastDocument: { path: 'Harmful Algal Blooms (HABs).md', content: 'DOC CONTENT HERE' }
    });

    expect(prompt).toContain('Last Document Context (Harmful Algal Blooms (HABs).md):');
    expect(prompt).toContain('DOC CONTENT HERE');
  });

  it('preserves lastDocument over history when context is truncated', () => {
    // Bug: lastDocument was placed AFTER history in context, so it got truncated first.
    // Fix: lastDocument should have HIGHER priority than history.
    const longHistory = 'User: First message\nAssistant: Reply 1\n'.repeat(50);
    const prompt = buildPrompt({
      userMessage: 'Summarize the HAB document',
      settings: { ...settings, maxContextChars: 1500 },
      coreRules,
      history: longHistory,
      lastDocument: { path: 'HABs.md', content: 'IMPORTANT_DOCUMENT_CONTENT' }
    });

    // lastDocument should survive truncation
    expect(prompt).toContain('IMPORTANT_DOCUMENT_CONTENT');
    // History may be partially truncated, but lastDocument must be there
    expect(prompt).toContain('Last Document Context (HABs.md):');
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
