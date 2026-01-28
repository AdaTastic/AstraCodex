type ToolMeta = {
  name: string;
  description: string;
  params?: Record<string, string>;
};

export type ToolModule = {
  meta: ToolMeta;
  run: (args: Record<string, unknown>, ctx: unknown) => Promise<unknown> | unknown;
};

type VaultAdapter = {
  list: (prefix: string) => Promise<string[]>;
  read: (path: string) => Promise<string>;
};

export class ToolRegistry {
  private adapter: VaultAdapter;
  private tools = new Map<string, ToolModule>();

  constructor(adapter: VaultAdapter) {
    this.adapter = adapter;
  }

  async loadTools() {
    const files = await this.adapter.list('AstraCodex/Tools');
    const toolFiles = files.filter((file) => file.endsWith('.js'));
    this.tools.clear();

    for (const file of toolFiles) {
      const source = await this.adapter.read(file);
      const module = this.evaluateTool(source);
      this.validateTool(module);
      this.tools.set(module.meta.name, module);
    }
  }

  listTools(): ToolMeta[] {
    return Array.from(this.tools.values()).map((tool) => tool.meta);
  }

  getTool(name: string): ToolModule | undefined {
    return this.tools.get(name);
  }

  private evaluateTool(source: string): ToolModule {
    const module = { exports: {} as ToolModule };
    const wrapper = new Function('module', 'exports', source);
    wrapper(module, module.exports);
    return module.exports;
  }

  private validateTool(tool: ToolModule) {
    if (!tool?.meta?.name || !tool?.meta?.description) {
      throw new Error('Tool meta must include name and description');
    }
    if (typeof tool.run !== 'function') {
      throw new Error(`Tool ${tool.meta.name} is missing run()`);
    }
  }
}