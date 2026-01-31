import { describe, it, expect } from 'vitest';
import { createTestContext, writeDebugLog } from './helpers';
import { runAgentLoop } from '../../agentLoop';
import type { Message } from '../../types';

/**
 * E2E Tests: File Appending Operations
 * 
 * Tests actual model behavior with the append tool.
 * Requires Ollama running with model from data.json.
 * 
 * To run: RUN_E2E=true npm run test:e2e
 */

describe('E2E: File Appending', () => {
  it('should append content to existing file', async () => {
    const ctx = createTestContext({
      'log.md': '# Activity Log\n\n- Entry 1\n- Entry 2'
    });

    const history: Message[] = [
      { role: 'user', content: 'Append "Entry 3" to log.md' },
      { role: 'assistant', content: 'I\'ll append "Entry 3" to log.md. Shall I proceed?' },
      { role: 'user', content: 'Yes, do it.' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-appending_append-to-existing');

    // Should have called append
    expect(ctx.vault.calls.append.length).toBeGreaterThanOrEqual(1);
    
    // File should contain original content plus new entry
    const finalContent = ctx.vault.files['log.md'];
    expect(finalContent).toContain('Entry 1');
    expect(finalContent).toContain('Entry 2');
    expect(finalContent.toLowerCase()).toContain('entry 3');
  }, { timeout: 60000 });

  it('should append to empty file', async () => {
    const ctx = createTestContext({
      'notes.md': ''
    });

    const history: Message[] = [
      { role: 'user', content: 'Add "First note" to notes.md' },
      { role: 'assistant', content: 'I\'ll add that to notes.md. Shall I proceed?' },
      { role: 'user', content: 'Yes.' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-appending_append-to-empty');

    // Should have written or appended
    const hasWriteOp = ctx.vault.calls.write.length > 0 || ctx.vault.calls.append.length > 0;
    expect(hasWriteOp).toBe(true);
    
    // File should contain new content
    const finalContent = ctx.vault.files['notes.md'];
    expect(finalContent.toLowerCase()).toContain('first note');
  }, { timeout: 60000 });

  it('should read then append based on content', async () => {
    const ctx = createTestContext({
      'tasks.md': '# Tasks\n\n- [ ] Task A\n- [ ] Task B'
    });

    const history: Message[] = [
      { role: 'user', content: 'Read tasks.md and add a new task "Task C"' },
      { 
        role: 'assistant', 
        content: 'Let me read the file first.',
        tool_calls: [{ name: 'read', arguments: { path: 'tasks.md' } }]
      },
      {
        role: 'tool',
        content: '# Tasks\n\n- [ ] Task A\n- [ ] Task B',
        tool_result: '# Tasks\n\n- [ ] Task A\n- [ ] Task B',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'I see the current tasks. I\'ll add "Task C". Shall I proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-appending_read-then-append');

    // Should have written or appended
    const hasWriteOp = ctx.vault.calls.write.length > 0 || ctx.vault.calls.append.length > 0;
    expect(hasWriteOp).toBe(true);
    
    // File should contain all tasks
    const finalContent = ctx.vault.files['tasks.md'];
    expect(finalContent).toContain('Task A');
    expect(finalContent).toContain('Task B');
    expect(finalContent.toLowerCase()).toContain('task c');
  }, { timeout: 90000 });

  it('should append multiple items in sequence', async () => {
    const ctx = createTestContext({
      'list.md': '# Shopping List\n\n- Milk'
    });

    // Pre-fill history with first append done
    const history: Message[] = [
      { role: 'user', content: 'Add "Bread" and "Eggs" to list.md one at a time' },
      { 
        role: 'assistant', 
        content: 'I\'ll add Bread first.',
        tool_calls: [{ name: 'append', arguments: { path: 'list.md', content: '\n- Bread' } }]
      },
      {
        role: 'tool',
        content: '{"success": true}',
        tool_result: { success: true },
        tool_call_id: '0-append'
      },
      { role: 'assistant', content: 'Added Bread. Now I\'ll add Eggs. Proceed?' },
      { role: 'user', content: 'Yes.' }
    ];

    // Simulate first append happened
    ctx.vault.files['list.md'] = '# Shopping List\n\n- Milk\n- Bread';

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-appending_multiple-items');

    // Should have appended Eggs
    const finalContent = ctx.vault.files['list.md'];
    expect(finalContent).toContain('Milk');
    expect(finalContent).toContain('Bread');
    expect(finalContent.toLowerCase()).toContain('egg');
  }, { timeout: 90000, retry: 2 });
});
