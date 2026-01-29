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
  setIcon: vi.fn(),
}));