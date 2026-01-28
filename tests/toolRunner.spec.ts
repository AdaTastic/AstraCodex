import { describe, expect, it, vi } from 'vitest';
import { ToolRunner } from '../toolRunner';

const adapter = () => ({
  read: vi.fn(async (path: string) => `content:${path}`),
  list: vi.fn(async () => ['one.md', 'two.md']),
  write: vi.fn(async () => undefined),
  append: vi.fn(async () => undefined)
});

describe('ToolRunner', () => {
  it('blocks write when confirmation required', async () => {
    const adapterInstance = adapter();
    const runner = new ToolRunner(adapterInstance, () => false);

    await expect(runner.writeFile('file.md', 'hello')).rejects.toThrow('Confirmation required');
  });

  it('appends memory with timestamp', async () => {
    const adapterInstance = adapter();
    const runner = new ToolRunner(adapterInstance, () => true, () => '2026-01-01T00:00:00.000Z');

    await runner.appendMemory('note', 'hello');
    expect(adapterInstance.append).toHaveBeenCalledWith(
      'AstraCodex/Memory.md',
      '- 2026-01-01T00:00:00.000Z — note: hello\n'
    );
  });

  it('executes a registered tool with context', async () => {
    const adapterInstance = adapter();
    const registry = {
      getTool: () => ({
        meta: { name: 'read', description: 'Read', params: { path: 'string' } },
        run: async ({ path }: { path: string }, ctx: { vault: { read: (p: string) => Promise<string> } }) =>
          ctx.vault.read(path)
      })
    } as any;
    const runner = new ToolRunner(adapterInstance, () => true, undefined, registry);

    const result = await runner.executeTool('read', { path: 'note.md' });

    expect(result).toBe('content:note.md');
  });

  it('provides activeFilePath in tool context when configured', async () => {
    const adapterInstance = adapter();
    const registry = {
      getTool: () => ({
        meta: { name: 'active_file', description: 'Active file', params: {} },
        run: async (_args: unknown, ctx: { activeFilePath?: string | null }) => ctx.activeFilePath
      })
    } as any;

    const runner = new ToolRunner(adapterInstance, () => true, undefined, registry, undefined, () => 'notes/today.md');
    const result = await runner.executeTool('active_file', {});
    expect(result).toBe('notes/today.md');
  });

  it('stores and confirms a pending edit', async () => {
    const adapterInstance = adapter();
    const runner = new ToolRunner(adapterInstance, () => true);
    const pending = {
      path: 'file.md',
      preview: { startLine: 1, endLine: 1, before: 'old', after: 'new' },
      updatedContent: 'new'
    };

    runner.setPendingEdit(pending);
    expect(runner.getPendingEdit()).toEqual(pending);

    await runner.confirmPendingEdit();

    expect(adapterInstance.write).toHaveBeenCalledWith('file.md', 'new');
    expect(runner.getPendingEdit()).toBeNull();
  });
});