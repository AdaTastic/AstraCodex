import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../toolRegistry';

const toolScript = `module.exports = {
  meta: {
    name: 'list',
    description: 'Search for vault files by substring match. Safe: does not attempt to scandir arbitrary prefixes.',
    params: { prefix: 'string' }
  },
  run: async ({ prefix }, ctx) => {
    const all = await ctx.vault.list('');
    const q = (prefix ?? '').toString().trim();
    if (!q) return all;

    const qLower = q.toLowerCase();
    const qMdLower = (q.endsWith('.md') ? q : q + '.md').toLowerCase();

    return all.filter((path) => {
      const p = path.toLowerCase();
      return p.includes(qLower) || p.includes(qMdLower);
    });
  }
};`;

const adapter = () => ({
  list: async (_prefix: string) => ['AstraCodex/Tools/list.js'],
  read: async (_path: string) => toolScript
});

describe('ToolRegistry', () => {
  it('loads tool metadata from tool scripts', async () => {
    const registry = new ToolRegistry(adapter());

    await registry.loadTools();

    expect(registry.listTools()).toEqual([
      {
        name: 'list',
        description: 'Search for vault files by substring match. Safe: does not attempt to scandir arbitrary prefixes.',
        params: { prefix: 'string' }
      }
    ]);
  });

  it('returns tool handlers by name', async () => {
    const registry = new ToolRegistry(adapter());

    await registry.loadTools();

    const tool = registry.getTool('list');
    expect(tool?.meta.name).toBe('list');
    expect(typeof tool?.run).toBe('function');
  });

  it('list tool can match titles without .md', async () => {
    const registry = new ToolRegistry(adapter());
    await registry.loadTools();
    const tool = registry.getTool('list');

    const result = await tool?.run(
      { prefix: 'Harmful Algal Blooms (HABs)' },
      {
        vault: {
          list: async (_prefix: string) => ['Harmful Algal Blooms (HABs).md', 'Other.md']
        }
      }
    );

    expect(result).toEqual(['Harmful Algal Blooms (HABs).md']);
  });
});