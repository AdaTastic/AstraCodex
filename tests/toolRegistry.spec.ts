import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../toolRegistry';

const toolScript = `module.exports = {
  meta: {
    name: 'read',
    description: 'Read a file',
    params: { path: 'string' }
  },
  run: async ({ path }, ctx) => ctx.vault.read(path)
};`;

const adapter = () => ({
  list: async (_prefix: string) => ['AstraCodex/Tools/read.js'],
  read: async (_path: string) => toolScript
});

describe('ToolRegistry', () => {
  it('loads tool metadata from tool scripts', async () => {
    const registry = new ToolRegistry(adapter());

    await registry.loadTools();

    expect(registry.listTools()).toEqual([
      {
        name: 'read',
        description: 'Read a file',
        params: { path: 'string' }
      }
    ]);
  });

  it('returns tool handlers by name', async () => {
    const registry = new ToolRegistry(adapter());

    await registry.loadTools();

    const tool = registry.getTool('read');
    expect(tool?.meta.name).toBe('read');
    expect(typeof tool?.run).toBe('function');
  });
});