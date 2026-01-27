import { Plugin, WorkspaceLeaf } from 'obsidian';
import { AgenticChatView, VIEW_TYPE_AGENTIC_CHAT } from './view';

export default class AstraCodexPlugin extends Plugin {
  async onload() {
    this.registerView(
      VIEW_TYPE_AGENTIC_CHAT,
      (leaf: WorkspaceLeaf) => new AgenticChatView(leaf)
    );

    this.addCommand({
      id: 'open-astracodex-chat-view',
      name: 'Open AstraCodex Chat Panel',
      callback: () => this.activateView()
    });

    this.addRibbonIcon('message-circle', 'Open AstraCodex Chat Panel', () => {
      this.activateView();
    });
  }

  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENTIC_CHAT).forEach((leaf) => leaf.detach());
  }

  private async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_AGENTIC_CHAT).first();

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_AGENTIC_CHAT, active: true });
    }

    workspace.revealLeaf(leaf);
  }
}
