export interface RuleManagerAdapter {
  read(path: string): Promise<string>;
  list(prefix: string): Promise<string[]>;
}

export interface CoreRules {
  charter: string;
  states: string;
  voice: string;
}

export class RuleManager {
  private adapter: RuleManagerAdapter;
  private paths = {
    charter: 'AstraCodex/charter.md',
    states: 'AstraCodex/states.md',
    voice: 'AstraCodex/voice.md',
    memory: 'AstraCodex/Memory.md',
    rulesDir: 'AstraCodex/Rules/'
  };

  constructor(adapter: RuleManagerAdapter) {
    this.adapter = adapter;
  }

  async loadCore(): Promise<CoreRules> {
    const [charter, states, voice] = await Promise.all([
      this.safeRead(this.paths.charter),
      this.safeRead(this.paths.states),
      this.safeRead(this.paths.voice)
    ]);

    return { charter, states, voice };
  }

  async loadMemory(): Promise<string> {
    return this.safeRead(this.paths.memory);
  }

  async loadRules(names: string[]): Promise<Record<string, string>> {
    const entries = await Promise.all(
      names.map(async (name) => {
        const normalized = name.endsWith('.md') ? name : `${name}.md`;
        const content = await this.safeRead(`${this.paths.rulesDir}${normalized}`);
        return [name.replace(/\.md$/, ''), content] as const;
      })
    );

    return Object.fromEntries(entries);
  }

  async listRuleFiles(): Promise<string[]> {
    return this.adapter.list(this.paths.rulesDir);
  }

  private async safeRead(path: string): Promise<string> {
    try {
      return await this.adapter.read(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Missing file: ${path}. (${message})`;
    }
  }
}