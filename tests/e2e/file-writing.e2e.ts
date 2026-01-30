import { describe, it, expect } from 'vitest';
import { createTestContext } from './helpers';
import { runAgentLoop } from '../../agentLoop';
import type { Message } from '../../types';

/**
 * E2E Tests: File Writing
 * 
 * Tests actual model behavior with write operations.
 * Requires Ollama running with model from data.json.
 * 
 * To run: RUN_E2E=true npm run test:e2e
 */

const skipE2E = !process.env.RUN_E2E;

describe('E2E: File Writing', () => {
  it.skipIf(skipE2E)('should create a new file when asked', async () => {
    const ctx = createTestContext({});

    const history: Message[] = [
      { role: 'user', content: 'Create a new file called todo.md with a task list: Buy groceries, Clean room' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4
    });

    // Should call write
    expect(ctx.vault.calls.write.length).toBeGreaterThanOrEqual(1);
    
    // File should be created with content
    const writeCall = ctx.vault.calls.write[0];
    expect(writeCall.path).toBe('todo.md');
    expect(writeCall.content.toLowerCase()).toContain('groceries');
  }, { timeout: 60000 });

  it.skipIf(skipE2E)('should append to existing file when asked', async () => {
    const ctx = createTestContext({
      'journal.md': '# Journal\n\n## Day 1\nStarted project'
    });

    const history: Message[] = [
      { role: 'user', content: 'Add a new entry to journal.md: Day 2 - Made progress on features' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4
    });

    // Should call append (not write) for existing file
    expect(ctx.vault.calls.append.length).toBeGreaterThanOrEqual(1);
    
    // Content should be appended
    const appendCall = ctx.vault.calls.append[0];
    expect(appendCall.path).toBe('journal.md');
    expect(appendCall.content.toLowerCase()).toContain('day 2');
  }, { timeout: 60000 });

  it.skipIf(skipE2E)('should write to nested path creating directories', async () => {
    const ctx = createTestContext({});

    const history: Message[] = [
      { role: 'user', content: 'Create a file at projects/web/readme.md with title "Web Project"' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4
    });

    // Should call write with nested path
    expect(ctx.vault.calls.write.length).toBeGreaterThanOrEqual(1);
    
    const writeCall = ctx.vault.calls.write[0];
    expect(writeCall.path).toContain('projects');
    expect(writeCall.path).toContain('readme.md');
  }, { timeout: 60000 });

  it.skipIf(skipE2E)('should overwrite file when explicitly asked', async () => {
    const ctx = createTestContext({
      'config.md': '# Old Config\n\nold settings'
    });

    const history: Message[] = [
      { role: 'user', content: 'Replace the contents of config.md with: # New Config\n\nNew settings here' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4
    });

    // Should call write (overwrite) not append
    expect(ctx.vault.calls.write.length).toBeGreaterThanOrEqual(1);
    
    const writeCall = ctx.vault.calls.write[0];
    expect(writeCall.content.toLowerCase()).toContain('new config');
  }, { timeout: 60000 });

  it.skipIf(skipE2E)('should generate appropriate markdown structure', async () => {
    const ctx = createTestContext({});

    const history: Message[] = [
      { role: 'user', content: 'Create a meeting notes file called meeting-2024-01.md with attendees: Alice, Bob, Charlie and action items' }
    ];

    await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4
    });

    // Should create file
    expect(ctx.vault.calls.write.length).toBeGreaterThanOrEqual(1);
    
    // Content should have markdown structure
    const content = ctx.vault.calls.write[0].content;
    expect(content).toContain('#'); // Has headings
    expect(content.toLowerCase()).toContain('alice'); // Has attendee
  }, { timeout: 60000 });
});
