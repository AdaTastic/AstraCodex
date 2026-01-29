export interface ToolRunnerAdapter {
  read(path: string): Promise<string>;
  list(prefix: string): Promise<string[]>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
}

type ToolRegistry = {
  getTool: (name: string) => { meta: { name: string; params?: Record<string, string> }; run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown> | unknown } | undefined;
};

type ToolContext = {
  vault: ToolRunnerAdapter;
  log: (message: string) => void;
  activeFilePath?: string | null;
};

type PendingEdit = {
  path: string;
  preview: { startLine: number; endLine: number; before: string; after: string };
  updatedContent: string;
};

export class ToolRunner {
  private adapter: ToolRunnerAdapter;
  private canActCallback: () => boolean;
  private now: () => string;
  private registry?: ToolRegistry;
  private getActiveFilePath?: () => string | null;
  private pendingEdit: PendingEdit | null = null;
  private onToolActivity?: (message: string) => void;

  constructor(
    adapter: ToolRunnerAdapter,
    canActCallback: () => boolean,
    now: () => string = () => new Date().toISOString(),
    registry?: ToolRegistry,
    onToolActivity?: (message: string) => void,
    getActiveFilePath?: () => string | null
  ) {
    this.adapter = adapter;
    this.canActCallback = canActCallback;
    this.now = now;
    this.registry = registry;
    this.onToolActivity = onToolActivity;
    this.getActiveFilePath = getActiveFilePath;
  }

  async readFile(path: string): Promise<string> {
    this.emitActivity(`Reading: ${path}`);
    return this.adapter.read(path);
  }

  async listFiles(prefix: string): Promise<string[]> {
    this.emitActivity(`Listing: ${prefix}`);
    return this.adapter.list(prefix);
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.ensureCanAct();
    this.emitActivity(`Writing: ${path}`);
    await this.adapter.write(path, content);
  }

  async appendFile(path: string, content: string): Promise<void> {
    this.ensureCanAct();
    this.emitActivity(`Appending: ${path}`);
    await this.adapter.append(path, content);
  }

  async appendMemory(label: string, text: string): Promise<void> {
    this.ensureCanAct();
    this.emitActivity('Appending memory entry');
    const entry = `- ${this.now()} — ${label}: ${text}\n`;
    await this.adapter.append('AstraCodex/Memory.md', entry);
  }

  canAct(): boolean {
    return this.canActCallback();
  }

  async executeTool(name: string, args: Record<string, unknown>) {
    if (!this.registry) {
      throw new Error('Tool registry is not configured.');
    }
    const tool = this.registry.getTool(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    this.emitActivity(`Tool: ${name}`);
    this.validateArgs(args, tool.meta.params ?? {});
    const ctx: ToolContext = {
      vault: this.adapter,
      log: (message: string) => console.log(`[Tool:${name}] ${message}`),
      activeFilePath: this.getActiveFilePath ? this.getActiveFilePath() : null
    };
    return tool.run(args, ctx);
  }

  setPendingEdit(edit: PendingEdit) {
    this.pendingEdit = edit;
  }

  getPendingEdit(): PendingEdit | null {
    return this.pendingEdit;
  }

  clearPendingEdit() {
    this.pendingEdit = null;
  }

  async confirmPendingEdit() {
    if (!this.pendingEdit) {
      throw new Error('No pending edit');
    }
    this.ensureCanAct();
    this.emitActivity(`Writing: ${this.pendingEdit.path}`);
    await this.adapter.write(this.pendingEdit.path, this.pendingEdit.updatedContent);
    this.clearPendingEdit();
  }

  private ensureCanAct() {
    if (!this.canActCallback()) {
      throw new Error('Confirmation required to perform write operations.');
    }
  }

  private validateArgs(args: Record<string, unknown>, params: Record<string, string>) {
    for (const [key, type] of Object.entries(params)) {
      if (!(key in args)) {
        throw new Error(`Missing parameter: ${key}`);
      }
      if (type === 'string' && typeof args[key] !== 'string') {
        throw new Error(`Invalid parameter type for ${key}`);
      }
    }
  }

  private emitActivity(message: string) {
    this.onToolActivity?.(message);
  }
}
