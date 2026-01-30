import { describe, it, expect } from 'vitest';
import { createTestContext, writeDebugLog } from './helpers';
import { runAgentLoop } from '../../agentLoop';
import type { Message } from '../../types';

/**
 * E2E Tests: File Reading
 * 
 * Tests actual model behavior with file reading operations.
 * Requires Ollama running with model from data.json.
 * 
 * To run: RUN_E2E=true npm run test:e2e
 */

describe('E2E: File Reading', () => {
  it('should read a file when asked', async () => {
    const ctx = createTestContext({
      'notes/test.md': '# Test File\n\nThis is test content with **bold** text.',
      'notes/other.md': '# Other File'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read the file notes/test.md' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    // Write debug log to file
    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-reading_read-file-when-asked');

    // Verify: read was called exactly once with correct path
    expect(ctx.vault.calls.read).toHaveLength(1);
    expect(ctx.vault.calls.read[0].path).toBe('notes/test.md');
    
    // Verify: response contains file content
    expect(result.text).toContain('Test File');
  }, { timeout: 60000 });

  it('should use list before read when path is ambiguous', async () => {
    const ctx = createTestContext({
      'notes/project.md': '# Project Notes',
      'docs/project.md': '# Project Docs',
      'archive/project.md': '# Archived Project'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read project.md' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 6,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-reading_list-before-read-ambiguous');

    // Model should call list to find files first
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    
    // Then read one of them
    expect(ctx.vault.calls.read.length).toBeGreaterThanOrEqual(1);
  }, { timeout: 60000 });

  it('should not repeat read for same file', async () => {
    const ctx = createTestContext({
      'test.md': '# Hello World\n\nImportant content here.'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read test.md and summarize it' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 8,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-reading_no-repeat-read');

    // Should read the file once, not repeatedly
    const readCallsForTestMd = ctx.vault.calls.read.filter(c => c.path === 'test.md');
    expect(readCallsForTestMd.length).toBe(1);
  }, { timeout: 60000 });

  it('should handle file not found gracefully', async () => {
    const ctx = createTestContext({
      'existing.md': '# Exists'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read nonexistent.md' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-reading_file-not-found');

    // Model should acknowledge the error in response
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes('not found') || 
      lowerText.includes('error') ||
      lowerText.includes("doesn't exist") ||
      lowerText.includes("does not exist")
    ).toBe(true);
  }, { timeout: 60000 });

  it('should not re-read file already in conversation', async () => {
    const ctx = createTestContext({
      'data.md': '# Data\n\nValue: 42'
    });

    // Simulate a conversation where file was already read
    const history: Message[] = [
      { role: 'user', content: 'Read data.md' },
      { 
        role: 'assistant', 
        content: 'Let me read that file.',
        tool_calls: [{ name: 'read', arguments: { path: 'data.md' } }]
      },
      {
        role: 'tool',
        content: '# Data\n\nValue: 42',
        tool_result: '# Data\n\nValue: 42',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'The file contains data with Value: 42.' },
      { role: 'user', content: 'What was the value in that file again?' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-reading_no-re-read-from-history');

    // Should NOT call read again - file content is in history
    expect(ctx.vault.calls.read).toHaveLength(0);
  }, { timeout: 60000 });
});
