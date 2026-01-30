import { describe, it, expect } from 'vitest';
import { createTestContext, writeDebugLog } from './helpers';
import { runAgentLoop } from '../../agentLoop';
import type { Message } from '../../types';

/**
 * E2E Tests: File Listing
 * 
 * Tests actual model behavior with directory listing operations.
 * Requires Ollama running with model from data.json.
 * 
 * To run: RUN_E2E=true npm run test:e2e
 */

describe('E2E: File Listing', () => {
  it('should list files when asked', async () => {
    const ctx = createTestContext({
      'notes/daily.md': '# Daily',
      'notes/weekly.md': '# Weekly',
      'notes/ideas.md': '# Ideas',
      'archive/old.md': '# Old'
    });

    const history: Message[] = [
      { role: 'user', content: 'What files are in the notes folder?' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-listing_list-files-when-asked');

    // Should call list with notes prefix
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    
    // Response should mention the files
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes('daily') ||
      lowerText.includes('weekly') ||
      lowerText.includes('ideas')
    ).toBe(true);
  }, { timeout: 60000 });

  it('should list all files when asked for vault contents', async () => {
    const ctx = createTestContext({
      'readme.md': '# Readme',
      'notes/one.md': '# One',
      'notes/two.md': '# Two',
      'docs/api.md': '# API'
    });

    const history: Message[] = [
      { role: 'user', content: 'List all files in my vault' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-listing_list-all-vault-contents');

    // Should call list
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    
    // Response should mention some files
    expect(result.text.length).toBeGreaterThan(20);
  }, { timeout: 60000 });

  it('should handle empty directory', async () => {
    const ctx = createTestContext({
      'other/file.md': '# Other'
    });

    const history: Message[] = [
      { role: 'user', content: 'What files are in the notes folder?' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-listing_handle-empty-directory');

    // Should indicate no files found or folder is empty
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes('no file') ||
      lowerText.includes('empty') ||
      lowerText.includes('not found') ||
      lowerText.includes("doesn't exist")
    ).toBe(true);
  }, { timeout: 60000 });

  it('should filter by file type when asked', async () => {
    const ctx = createTestContext({
      'notes/meeting.md': '# Meeting',
      'notes/tasks.md': '# Tasks',
      'notes/image.png': 'binary data',
      'notes/data.json': '{"key": "value"}'
    });

    const history: Message[] = [
      { role: 'user', content: 'What markdown files are in notes?' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-listing_filter-by-file-type');

    // Should call list
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    
    // Response should focus on .md files
    const lowerText = result.text.toLowerCase();
    expect(lowerText.includes('meeting') || lowerText.includes('tasks')).toBe(true);
  }, { timeout: 60000 });

  it('should drill down into nested directories', async () => {
    const ctx = createTestContext({
      'projects/web/index.md': '# Web Project',
      'projects/web/api.md': '# API Docs',
      'projects/mobile/readme.md': '# Mobile',
      'projects/archived/old.md': '# Old'
    });

    const history: Message[] = [
      { role: 'user', content: 'Show me files in projects/web/' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'file-listing_drill-down-nested');

    // Should call list with projects/web prefix
    const webLists = ctx.vault.calls.list.filter(c => 
      c.prefix.includes('projects/web') || c.prefix.includes('projects\\web')
    );
    expect(webLists.length).toBeGreaterThanOrEqual(1);
  }, { timeout: 60000 });
});
