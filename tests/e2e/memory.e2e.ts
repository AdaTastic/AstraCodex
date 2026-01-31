import { describe, it, expect } from 'vitest';
import { createTestContext, writeDebugLog } from './helpers';
import { runAgentLoop } from '../../agentLoop';
import type { Message } from '../../types';

/**
 * E2E Tests: Memory Policy Compliance
 * 
 * Tests that the model follows memory_policy.md rules:
 * - Only store when explicitly asked
 * - Summarize before storing
 * - Store appropriate content types
 * - Reject inappropriate content types
 * 
 * Requires Ollama running with model from data.json.
 * 
 * To run: RUN_E2E=true npm run test:e2e
 */

describe('E2E: Memory Policy', () => {
  it('should only store memory when explicitly asked', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n'
    });

    // User shares preference but doesn't ask to remember
    const history: Message[] = [
      { role: 'user', content: 'I prefer dark mode in all my apps.' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_no-auto-store');

    // Should NOT write to Memory.md without explicit request
    const memoryWrites = ctx.vault.calls.write.filter(c => c.path.includes('Memory'));
    const memoryAppends = ctx.vault.calls.append.filter(c => c.path.includes('Memory'));
    
    expect(memoryWrites.length + memoryAppends.length).toBe(0);
  }, { timeout: 60000 });

  it('should store memory when explicitly asked', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n'
    });

    const history: Message[] = [
      { role: 'user', content: 'Remember that I prefer TypeScript over JavaScript' },
      { role: 'assistant', content: 'I\'ll save that preference. Shall I proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_explicit-store');

    // Should write to Memory.md
    const hasMemoryWrite = 
      ctx.vault.calls.write.some(c => c.path.includes('Memory')) ||
      ctx.vault.calls.append.some(c => c.path.includes('Memory'));
    
    expect(hasMemoryWrite).toBe(true);
    
    // Memory should contain the preference
    const memoryContent = ctx.vault.files['AstraCodex/Memory.md'];
    expect(memoryContent.toLowerCase()).toContain('typescript');
  }, { timeout: 90000, retry: 2 });

  it('should summarize before storing (not store verbatim)', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n'
    });

    const longPreference = 'Please remember this: When I\'m working on web projects I always want to use React with TypeScript and I prefer functional components with hooks over class components, and I like to use Tailwind CSS for styling because it\'s fast and flexible.';
    
    const history: Message[] = [
      { role: 'user', content: longPreference },
      { role: 'assistant', content: 'I\'ll save a summary of your preferences. Proceed?' },
      { role: 'user', content: 'Yes, save it.' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_summarize-before-store');

    // Check what was written
    const memoryContent = ctx.vault.files['AstraCodex/Memory.md'];
    
    // Should contain key concepts but be shorter than original
    expect(memoryContent.toLowerCase()).toContain('react');
    // Should not contain the full verbatim text
    expect(memoryContent).not.toContain(longPreference);
  }, { timeout: 90000, retry: 2 });

  it('should store user preferences when asked', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n'
    });

    const history: Message[] = [
      { role: 'user', content: 'Save my preference: I like concise responses without unnecessary explanations' },
      { role: 'assistant', content: 'I\'ll save that preference. Proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_store-preference');

    const memoryContent = ctx.vault.files['AstraCodex/Memory.md'];
    expect(memoryContent.toLowerCase()).toContain('concise');
  }, { timeout: 90000, retry: 2 });

  it('should store project information when asked', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n'
    });

    const history: Message[] = [
      { role: 'user', content: 'Remember that my current project is called "Nexus" and it\'s a task management app' },
      { role: 'assistant', content: 'I\'ll save that project info. Proceed?' },
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

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_store-project');

    const memoryContent = ctx.vault.files['AstraCodex/Memory.md'];
    expect(memoryContent.toLowerCase()).toContain('nexus');
  }, { timeout: 90000, retry: 2 });

  it('should decline to store emotional states', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n'
    });

    const history: Message[] = [
      { role: 'user', content: 'Remember that I\'m feeling really frustrated and stressed about my deadlines' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_decline-emotional');

    // Should either not store, or response should acknowledge this isn't appropriate to store
    const memoryContent = ctx.vault.files['AstraCodex/Memory.md'];
    const lowerResponse = result.text.toLowerCase();
    
    // Either memory is unchanged, or response mentions not storing emotional states
    const noEmotionalStore = 
      !memoryContent.toLowerCase().includes('frustrated') ||
      lowerResponse.includes('emotional') ||
      lowerResponse.includes('temporary') ||
      lowerResponse.includes('not store') ||
      lowerResponse.includes("won't") ||
      lowerResponse.includes('cannot');
    
    expect(noEmotionalStore).toBe(true);
  }, { timeout: 90000, retry: 2 });

  it('should decline to store temporary tasks', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n'
    });

    const history: Message[] = [
      { role: 'user', content: 'Remember that I need to buy milk tomorrow' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_decline-temporary');

    // Should either not store, or suggest a better place for temporary tasks
    const memoryContent = ctx.vault.files['AstraCodex/Memory.md'];
    const lowerResponse = result.text.toLowerCase();
    
    // Either memory doesn't have the task, or response suggests alternatives
    const noTemporaryStore = 
      !memoryContent.toLowerCase().includes('milk') ||
      lowerResponse.includes('temporary') ||
      lowerResponse.includes('todo') ||
      lowerResponse.includes('task list') ||
      lowerResponse.includes('note');
    
    expect(noTemporaryStore).toBe(true);
  }, { timeout: 90000, retry: 2 });

  it('should read memory and use it in responses', async () => {
    const ctx = createTestContext({
      'AstraCodex/Memory.md': '# Memory\n\n- User prefers short responses\n- Current project: Nexus (task app)'
    });

    const history: Message[] = [
      { role: 'user', content: 'What do you know about my preferences?' }
    ];

    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });

    writeDebugLog(ctx.debugLog, ctx.vault.calls, 'memory_read-and-use');

    // Should read memory file
    const memoryReads = ctx.vault.calls.read.filter(c => c.path.includes('Memory'));
    expect(memoryReads.length).toBeGreaterThanOrEqual(1);
    
    // Response should reference stored preferences
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes('short') ||
      lowerText.includes('nexus') ||
      lowerText.includes('preference') ||
      lowerText.includes('project')
    ).toBe(true);
  }, { timeout: 90000, retry: 2 });
});
