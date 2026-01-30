import { describe, it, expect } from 'vitest';
import { createTestContext, writeDebugLog } from './helpers';
import { runAgentLoop } from '../../agentLoop';
import type { Message } from '../../types';

/**
 * E2E Tests: Multi-Step Operations
 * 
 * Tests actual model behavior with complex workflows.
 * Requires Ollama running with model from data.json.
 * 
 * To run: RUN_E2E=true npm run test:e2e
 */

describe('E2E: Multi-Step Operations', () => {
  it('should complete a read-modify-write workflow', async () => {
    const ctx = createTestContext({
      'data.md': '# Data\n\n- Item 1\n- Item 2'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read data.md and add a third item "Item 3" to the list' },
      { 
        role: 'assistant', 
        content: 'Let me read the file first.',
        tool_calls: [{ name: 'read', arguments: { path: 'data.md' } }]
      },
      {
        role: 'tool',
        content: '# Data\n\n- Item 1\n- Item 2',
        tool_result: '# Data\n\n- Item 1\n- Item 2',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'I\'ve read the file. I\'ll add "Item 3" to the list. Shall I proceed?' },
      { role: 'user', content: 'Yes, add it.' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'multi-step_read-modify-write');

    // Should write or append (read already happened in history)
    const hasWrite = ctx.vault.calls.write.length > 0 || ctx.vault.calls.append.length > 0;
    expect(hasWrite).toBe(true);
    
    // Content should include Item 3
    const finalContent = ctx.vault.files['data.md'];
    expect(finalContent.toLowerCase()).toContain('item 3');
  }, { timeout: 90000 });

  it('should follow multi-file instructions', async () => {
    const ctx = createTestContext({
      'source.md': '# Source\n\nImportant data: 42',
      'target.md': '# Target\n\n(empty)'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read the value from source.md and write it to target.md' },
      { 
        role: 'assistant', 
        content: 'Let me read source.md first.',
        tool_calls: [{ name: 'read', arguments: { path: 'source.md' } }]
      },
      {
        role: 'tool',
        content: '# Source\n\nImportant data: 42',
        tool_result: '# Source\n\nImportant data: 42',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'I found the value 42. I\'ll write it to target.md. Shall I proceed?' },
      { role: 'user', content: 'Yes, write it.' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'multi-step_multi-file-instructions');

    // Should write to target (read already happened in history)
    const targetWrites = ctx.vault.calls.write.filter(c => c.path === 'target.md');
    const targetAppends = ctx.vault.calls.append.filter(c => c.path === 'target.md');
    expect(targetWrites.length + targetAppends.length).toBeGreaterThanOrEqual(1);
    
    // Target should contain the value
    const targetContent = ctx.vault.files['target.md'];
    expect(targetContent).toContain('42');
  }, { timeout: 90000 });

  it('should stop after completing task (not loop forever)', async () => {
    const ctx = createTestContext({
      'simple.md': '# Simple File\n\nHello World'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read simple.md' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 8,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'multi-step_stop-after-completing');

    // Should complete in few turns, not exhaust maxTurns
    // Count assistant messages added after the user message
    const assistantMessages = history.filter(m => m.role === 'assistant');
    expect(assistantMessages.length).toBeLessThanOrEqual(4);
    
    // Should have read the file
    expect(ctx.vault.calls.read).toHaveLength(1);
    
    // Response should contain file content
    expect(result.text.toLowerCase()).toContain('hello world');
  }, { timeout: 60000 });

  it('should handle errors and recover', async () => {
    const ctx = createTestContext({
      'backup.md': '# Backup Data\n\nFallback content'
    });

    const history: Message[] = [
      { role: 'user', content: 'Try to read main.md, if it fails read backup.md instead' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 6,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'multi-step_error-and-recover');

    // Should try to read main.md first (will fail)
    const mainReads = ctx.vault.calls.read.filter(c => c.path === 'main.md');
    expect(mainReads.length).toBeGreaterThanOrEqual(1);
    
    // Should then read backup.md
    const backupReads = ctx.vault.calls.read.filter(c => c.path === 'backup.md');
    expect(backupReads.length).toBeGreaterThanOrEqual(1);
    
    // Response should contain backup content
    expect(result.text.toLowerCase()).toContain('backup');
  }, { timeout: 90000 });

  it('should list then read in sequence', async () => {
    const ctx = createTestContext({
      'notes/meeting-jan.md': '# January Meeting\n\nDiscussed budget',
      'notes/meeting-feb.md': '# February Meeting\n\nReviewed progress',
      'notes/todo.md': '# Todo List'
    });

    const history: Message[] = [
      { role: 'user', content: 'List files in notes folder, then read the January meeting notes' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 6,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'multi-step_list-then-read');

    // Should call list first
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    
    // Should then read the January file
    const janReads = ctx.vault.calls.read.filter(c => c.path.includes('jan'));
    expect(janReads.length).toBeGreaterThanOrEqual(1);
    
    // Response should mention budget (from the file)
    expect(result.text.toLowerCase()).toContain('budget');
  }, { timeout: 90000 });

  it('should summarize multiple files', async () => {
    const ctx = createTestContext({
      'chapter1.md': '# Chapter 1\n\nThe hero begins the journey.',
      'chapter2.md': '# Chapter 2\n\nThe hero faces challenges.',
      'chapter3.md': '# Chapter 3\n\nThe hero triumphs.'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read all three chapters and give me a one-line summary of the story' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 10,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'multi-step_summarize-multiple-files');

    // Should read all three files
    expect(ctx.vault.calls.read.length).toBeGreaterThanOrEqual(3);
    
    // Response should have a summary
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes('hero') ||
      lowerText.includes('journey') ||
      lowerText.includes('triumph')
    ).toBe(true);
  }, { timeout: 120000 });
});
