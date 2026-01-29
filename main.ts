import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { AgenticChatView, VIEW_TYPE_AGENTIC_CHAT } from './view';
import { AstraCodexSettings, defaultSettings, mergeSettings } from './settings';

export default class AstraCodexPlugin extends Plugin {
  settings: AstraCodexSettings = defaultSettings();

  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_AGENTIC_CHAT,
      (leaf: WorkspaceLeaf) => new AgenticChatView(leaf, this.settings)
    );

    this.addCommand({
      id: 'open-astracodex-chat-view',
      name: 'Open AstraCodex Chat Panel',
      callback: () => this.activateView()
    });

    this.addRibbonIcon('message-circle', 'Open AstraCodex Chat Panel', () => {
      this.activateView();
    });

    this.addSettingTab(new AstraCodexSettingTab(this.app, this));
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

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = mergeSettings(loaded as Partial<AstraCodexSettings> | undefined);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.broadcastSettings();
  }

  private broadcastSettings() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENTIC_CHAT).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof AgenticChatView) {
        view.updateSettings(this.settings);
      }
    });
  }
}

class AstraCodexSettingTab extends PluginSettingTab {
  private plugin: AstraCodexPlugin;

  constructor(app: App, plugin: AstraCodexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Ollama Base URL')
      .setDesc('Default: http://127.0.0.1:11434')
      .addText((text) =>
        text
          .setPlaceholder('http://127.0.0.1:11434')
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim() || 'http://127.0.0.1:11434';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Ollama model name')
      .addText((text) =>
        text
          .setPlaceholder('qwen2.5:32b-instruct')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim() || 'qwen2.5:32b-instruct';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max context length')
      .setDesc('Maximum characters of combined prompt context.')
      .addSlider((slider) =>
        slider
          .setLimits(1000, 120000, 500)
          .setValue(this.plugin.settings.maxContextChars)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxContextChars = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max memory length')
      .setDesc('Maximum characters of memory injected into prompt.')
      .addSlider((slider) =>
        slider
          .setLimits(500, 10000, 250)
          .setValue(this.plugin.settings.maxMemoryChars)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxMemoryChars = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Include active note by default')
      .setDesc('Sets the default toggle state for active note context.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.includeActiveNote).onChange(async (value) => {
          this.plugin.settings.includeActiveNote = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
