import { vi } from 'vitest';

// Mock Obsidian module
vi.mock('obsidian', () => ({
  MarkdownView: vi.fn(),
  App: vi.fn(),
  MarkdownFileInfo: vi.fn(),
  Menu: vi.fn(),
  MenuItem: vi.fn(),
  Notice: vi.fn(),
  TFile: vi.fn(),
  TFolder: vi.fn(),
  TAbstractFile: vi.fn(),
  Workspace: vi.fn(),
  WorkspaceLeaf: vi.fn(),
  View: vi.fn(),
  ItemView: class ItemView {
    app: any;
    containerEl: any = {
      empty: vi.fn(),
      addClass: vi.fn(),
      createDiv: vi.fn(() => ({
        createDiv: vi.fn(() => ({
          createDiv: vi.fn(),
          createEl: vi.fn(() => ({ addEventListener: vi.fn() })),
          hide: vi.fn(),
          show: vi.fn()
        })),
        createEl: vi.fn(() => ({ addEventListener: vi.fn(), empty: vi.fn() })),
        hide: vi.fn(),
        show: vi.fn()
      })),
      createEl: vi.fn(() => ({ addEventListener: vi.fn() }))
    };
    constructor(leaf: any) {
      this.app = leaf?.app ?? {};
    }
    getViewType() { return ''; }
    getDisplayText() { return ''; }
    getIcon() { return ''; }
    async onOpen() {}
    async onClose() {}
  },
  setIcon: vi.fn(),
}));
