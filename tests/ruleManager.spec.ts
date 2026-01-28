import { describe, expect, it } from 'vitest';
import { RuleManager } from '../ruleManager';

const mockAdapter = (files: Record<string, string>) => ({
  read: async (path: string) => {
    const value = files[path];
    if (value === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return value;
  },
  list: async (prefix: string) => {
    return Object.keys(files).filter((file) => file.startsWith(prefix));
  }
});

describe('RuleManager', () => {
  it('loads core rule files and returns content', async () => {
    const manager = new RuleManager(mockAdapter({
      'AstraCodex/charter.md': 'charter',
      'AstraCodex/states.md': 'states',
      'AstraCodex/voice.md': 'voice'
    }));

    const core = await manager.loadCore();
    expect(core.charter).toBe('charter');
    expect(core.states).toBe('states');
    expect(core.voice).toBe('voice');
  });

  it('returns fallback text when a core file is missing', async () => {
    const manager = new RuleManager(mockAdapter({
      'AstraCodex/charter.md': 'charter'
    }));

    const core = await manager.loadCore();
    expect(core.charter).toBe('charter');
    expect(core.states).toContain('Missing');
    expect(core.voice).toContain('Missing');
  });

  it('loads rule files by name', async () => {
    const manager = new RuleManager(mockAdapter({
      'AstraCodex/Rules/alpha.md': 'alpha',
      'AstraCodex/Rules/beta.md': 'beta'
    }));

    const rules = await manager.loadRules(['alpha', 'beta']);
    expect(rules.alpha).toBe('alpha');
    expect(rules.beta).toBe('beta');
  });
});