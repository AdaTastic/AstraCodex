import { describe, it, expect } from 'vitest';
import { createTestContext, writeDebugLog } from './helpers';
import { runAgentLoop } from '../../agentLoop';
import type { Message } from '../../types';

/**
 * E2E Tests: Line Editing Operations
 * 
 * Tests actual model behavior with the line_edit tool.
 * Requires Ollama running with model from data.json.
 * 
 * To run: RUN_E2E=true npm run test:e2e
 */

describe('E2E: Line Editing', () => {
  it('should edit specific line in a file', async () => {
    const ctx = createTestContext({
      'config.md': '# Config\n\nversion: 1.0\nstatus: draft\nowner: admin'
    });

    const history: Message[] = [
      { role: 'user', content: 'Change the status line in config.md from "draft" to "published"' },
      { 
        role: 'assistant', 
        content: 'Let me read the file first to find the line number.',
        tool_calls: [{ name: 'read', arguments: { path: 'config.md' } }]
      },
      {
        role: 'tool',
        content: '# Config\n\nversion: 1.0\nstatus: draft\nowner: admin',
        tool_result: '# Config\n\nversion: 1.0\nstatus: draft\nowner: admin',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'Found it. I\'ll change line 4 from "status: draft" to "status: published". Proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'line-editing_edit-specific-line');

    // Should have modified the file (via line_edit or write)
    const finalContent = ctx.vault.files['config.md'];
    expect(finalContent).toContain('version: 1.0');
    expect(finalContent).toContain('owner: admin');
    expect(finalContent.toLowerCase()).toContain('published');
    expect(finalContent.toLowerCase()).not.toContain('draft');
  }, { timeout: 90000, retry: 2 });

  it('should handle multi-line replacement', async () => {
    const ctx = createTestContext({
      'notes.md': '# Notes\n\nLine A\nLine B\nLine C\nLine D'
    });

    const history: Message[] = [
      { role: 'user', content: 'Replace lines 4-5 (Line B and Line C) with "New Line X"' },
      { 
        role: 'assistant', 
        content: 'Let me read the file first.',
        tool_calls: [{ name: 'read', arguments: { path: 'notes.md' } }]
      },
      {
        role: 'tool',
        content: '# Notes\n\nLine A\nLine B\nLine C\nLine D',
        tool_result: '# Notes\n\nLine A\nLine B\nLine C\nLine D',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'I\'ll replace lines 4-5 with "New Line X". Proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'line-editing_multi-line-replacement');

    // Should have modified the file
    const finalContent = ctx.vault.files['notes.md'];
    expect(finalContent).toContain('Line A');
    expect(finalContent).toContain('Line D');
    expect(finalContent.toLowerCase()).toContain('new line x');
    // Lines B and C should be gone
    expect(finalContent).not.toContain('Line B');
    expect(finalContent).not.toContain('Line C');
  }, { timeout: 90000, retry: 2 });

  it('should delete lines when replacement is empty', async () => {
    const ctx = createTestContext({
      'todo.md': '# Todo\n\n- Task 1\n- DELETE ME\n- Task 2'
    });

    const history: Message[] = [
      { role: 'user', content: 'Delete the "DELETE ME" line from todo.md' },
      { 
        role: 'assistant', 
        content: 'Let me read the file.',
        tool_calls: [{ name: 'read', arguments: { path: 'todo.md' } }]
      },
      {
        role: 'tool',
        content: '# Todo\n\n- Task 1\n- DELETE ME\n- Task 2',
        tool_result: '# Todo\n\n- Task 1\n- DELETE ME\n- Task 2',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'I\'ll delete line 4. Proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'line-editing_delete-line');

    // Should have modified the file
    const finalContent = ctx.vault.files['todo.md'];
    expect(finalContent).toContain('Task 1');
    expect(finalContent).toContain('Task 2');
    expect(finalContent).not.toContain('DELETE ME');
  }, { timeout: 90000, retry: 2 });

  it('should handle edge case: first line edit', async () => {
    const ctx = createTestContext({
      'header.md': 'Old Title\n\nContent below.'
    });

    const history: Message[] = [
      { role: 'user', content: 'Change the first line of header.md to "# New Title"' },
      { 
        role: 'assistant', 
        content: 'Let me read the file.',
        tool_calls: [{ name: 'read', arguments: { path: 'header.md' } }]
      },
      {
        role: 'tool',
        content: 'Old Title\n\nContent below.',
        tool_result: 'Old Title\n\nContent below.',
        tool_call_id: '0-read'
      },
      { role: 'assistant', content: 'I\'ll change line 1. Proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'line-editing_first-line');

    // Should have modified the file
    const finalContent = ctx.vault.files['header.md'];
    expect(finalContent).toContain('Content below');
    expect(finalContent.toLowerCase()).toContain('new title');
    expect(finalContent).not.toContain('Old Title');
  }, { timeout: 90000, retry: 2 });

  it('should show preview before applying edit', async () => {
    const ctx = createTestContext({
      'preview.md': 'Line 1\nLine 2\nLine 3'
    });

    const history: Message[] = [
      { role: 'user', content: 'Replace line 2 with "Updated Line" in preview.md and show me what will change' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 6,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'line-editing_preview');

    // Response should mention the before/after or show preview
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes('line 2') ||
      lowerText.includes('before') ||
      lowerText.includes('after') ||
      lowerText.includes('preview') ||
      lowerText.includes('change') ||
      lowerText.includes('updated')
    ).toBe(true);
  }, { timeout: 90000, retry: 2 });
});
