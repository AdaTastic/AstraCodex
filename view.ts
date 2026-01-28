import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Message, ParsedHeader } from './types';
import { AstraCodexSettings, defaultSettings } from './settings';
import { RuleManager } from './ruleManager';
import { buildPrompt } from './promptBuilder';
import { StateMachine } from './stateMachine';
import { ModelClient } from './modelClient';
import { ToolRunner } from './toolRunner';
import { ToolRegistry } from './toolRegistry';
import { ChatStore, ChatMeta, ChatRecord } from './chatStore';
import { restoreChatState } from './chatSession';

export const VIEW_TYPE_AGENTIC_CHAT = 'agentic-chat-view';
const LOADING_TIMEOUT_MS = 20000;

export class AgenticChatView extends ItemView {
  private messages: Message[] = [];
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private statusEl!: HTMLDivElement;
  private transcriptEl!: HTMLDivElement;
  private headerEl!: HTMLDivElement;
  private toolStatusEl!: HTMLDivElement;
  private editPreviewWrapper!: HTMLDivElement;
  private editConfirmBtn!: HTMLButtonElement;
  private editRejectBtn!: HTMLButtonElement;
  private chatSelect!: HTMLSelectElement;
  private chatNewBtn!: HTMLButtonElement;
  private chatDeleteBtn!: HTMLButtonElement;
  private chatExitBtn!: HTMLButtonElement;
  private confirmWrapper!: HTMLDivElement;
  private confirmBtn!: HTMLButtonElement;
  private includeActiveNoteToggle!: HTMLInputElement;
  private loading = false;
  private loadingTimer: number | null = null;
  private settings = defaultSettings();
  private stateMachine = new StateMachine(['idle', 'thinking', 'acting']);
  private stateMap: Record<string, string> = {};
  private parsedHeader: ParsedHeader | null = null;
  private activeChatId: string | null = null;
  private chatIndex: ChatMeta[] = [];
  private ruleManager = new RuleManager({
    read: (path) => this.app.vault.adapter.read(path),
    list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files)
  });
  private chatStore = new ChatStore({
    read: (path) => this.app.vault.adapter.read(path),
    write: (path, content) => this.app.vault.adapter.write(path, content),
    remove: (path) => this.app.vault.adapter.remove(path),
    exists: (path) => this.app.vault.adapter.exists(path),
    list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files)
  });
  private toolRegistry = new ToolRegistry({
    read: (path) => this.app.vault.adapter.read(path),
    list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files)
  });
  private modelClient = new ModelClient(this.settings);
  private toolRunner = new ToolRunner(
    {
      read: (path) => this.app.vault.adapter.read(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files),
      write: (path, content) => this.app.vault.adapter.write(path, content),
      append: (path, content) => this.app.vault.adapter.append(path, content)
    },
    () => this.stateMachine.canAct(),
    undefined,
    this.toolRegistry,
    (message) => this.renderToolStatus(message)
  );

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_AGENTIC_CHAT;
  }

  getDisplayText() {
    return 'AstraCodex';
  }

  getIcon() {
    return 'message-circle';
  }

  async onOpen() {
    const container = this.containerEl;
    container.empty();
    container.addClass('agentic-chat-view');

    const header = container.createDiv('agentic-chat-header');
    header.createEl('h4', { text: 'AstraCodex' });
    const chatControls = header.createDiv('agentic-chat-session-controls');
    this.chatSelect = chatControls.createEl('select', { cls: 'agentic-chat-session-select' });
    this.chatNewBtn = chatControls.createEl('button', { text: 'New' });
    this.chatDeleteBtn = chatControls.createEl('button', { text: 'Delete' });
    this.chatExitBtn = chatControls.createEl('button', { text: 'Exit' });

    const transcriptWrapper = container.createDiv('agentic-chat-transcript-wrapper');
    this.transcriptEl = transcriptWrapper.createDiv('agentic-chat-transcript');

    const headerRow = container.createDiv('agentic-chat-header-row');
    this.headerEl = headerRow.createDiv('agentic-chat-header-state');
    this.toolStatusEl = headerRow.createDiv('agentic-chat-tool-status');

    const toggleRow = container.createDiv('agentic-chat-toggle-row');
    const toggleLabel = toggleRow.createEl('label');
    this.includeActiveNoteToggle = toggleLabel.createEl('input', { attr: { type: 'checkbox' } });
    toggleLabel.appendText(' Include active note context');

    const inputWrapper = container.createDiv('agentic-chat-input-wrapper');
    this.inputEl = inputWrapper.createEl('textarea', { cls: 'agentic-chat-input', attr: { rows: '3', placeholder: 'Ask or instruct the assistant…' } });
    this.sendBtn = inputWrapper.createEl('button', { cls: 'agentic-chat-send-btn', text: 'Send' });
    this.statusEl = container.createDiv('agentic-chat-status');

    this.confirmWrapper = container.createDiv('agentic-chat-confirm-wrapper');
    this.confirmBtn = this.confirmWrapper.createEl('button', { cls: 'agentic-chat-confirm-btn', text: 'Confirm Action' });
    this.confirmWrapper.hide();

    this.editPreviewWrapper = container.createDiv('agentic-chat-edit-preview');
    this.editPreviewWrapper.hide();
    const previewHeader = this.editPreviewWrapper.createDiv({ cls: 'agentic-chat-edit-title', text: 'Pending Edit Preview' });
    const previewBody = this.editPreviewWrapper.createDiv({ cls: 'agentic-chat-edit-body' });
    const previewControls = this.editPreviewWrapper.createDiv({ cls: 'agentic-chat-edit-controls' });
    this.editConfirmBtn = previewControls.createEl('button', { cls: 'agentic-chat-confirm-btn', text: 'Apply Edit' });
    this.editRejectBtn = previewControls.createEl('button', { cls: 'agentic-chat-reject-btn', text: 'Reject' });

    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.inputEl.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && (evt.metaKey || evt.ctrlKey)) {
        evt.preventDefault();
        this.handleSend();
      }
    });
    this.inputEl.addEventListener('input', () => this.updateControls());
    this.inputEl.addEventListener('keyup', () => this.updateControls());

    this.confirmBtn.addEventListener('click', () => this.handleConfirm());
    this.editConfirmBtn.addEventListener('click', () => this.confirmPendingEdit());
    this.editRejectBtn.addEventListener('click', () => this.rejectPendingEdit());
    this.chatNewBtn.addEventListener('click', () => this.createNewChat());
    this.chatDeleteBtn.addEventListener('click', () => this.deleteCurrentChat());
    this.chatExitBtn.addEventListener('click', () => this.exitChat());
    this.chatSelect.addEventListener('change', () => this.switchChat(this.chatSelect.value));
    this.includeActiveNoteToggle.addEventListener('change', () => {
      this.settings.includeActiveNote = this.includeActiveNoteToggle.checked;
      this.refreshUI();
    });

    this.includeActiveNoteToggle.checked = this.settings.includeActiveNote;
    await this.loadChatIndex();
    await this.loadStateConfiguration();
    await this.toolRegistry.loadTools();
    this.refreshUI();
  }

  async onClose() {
    this.clearLoadingTimer();
  }

  private setLoading(flag: boolean) {
    this.loading = flag;
    this.updateControls();
    this.clearLoadingTimer();
    if (flag) {
      this.loadingTimer = window.setTimeout(() => {
        this.loading = false;
        this.updateControls();
      }, LOADING_TIMEOUT_MS);
    }
  }

  private clearLoadingTimer() {
    if (this.loadingTimer !== null) {
      window.clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
  }

  private refreshUI() {
    this.renderMessages();
    this.updateControls();
    this.renderHeader();
    this.renderConfirmation();
    this.renderEditPreview();
  }

  private renderMessages() {
    (this.transcriptEl as any).empty();
    for (const msg of this.messages) {
      const row = (this.transcriptEl as any).createDiv({ cls: ['agentic-chat-row', `role-${msg.role}`] });
      const bubble = row.createDiv({ cls: 'agentic-chat-bubble' });
      const label = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : 'System';
      bubble.createDiv({ cls: 'agentic-chat-label', text: label });

      if (msg.role === 'assistant' && msg.header) {
        const headerToggle = bubble.createDiv({
          cls: 'agentic-chat-header-toggle',
          text: msg.headerExpanded ? 'Header ▾' : 'Header ▸'
        });
        headerToggle.addEventListener('click', () => {
          msg.headerExpanded = !msg.headerExpanded;
          this.renderMessages();
        });

        if (msg.headerExpanded) {
          bubble.createDiv({ cls: 'agentic-chat-header-text', text: msg.header });
        }
      }

      bubble.createDiv({ cls: 'agentic-chat-text', text: msg.text });
    }
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }

  private updateControls() {
    const trimmed = this.inputEl.value.trim();
    (this.sendBtn as any).toggleClass('is-loading', this.loading);
    if (this.loading || trimmed.length === 0) {
      (this.sendBtn as any).setAttr('disabled', 'true');
      this.statusEl.setText(this.loading ? 'Sending...' : 'Disabled: enter text');
    } else {
      this.sendBtn.removeAttribute('disabled');
      this.statusEl.setText('Ready');
    }
  }

  private renderToolStatus(message: string) {
    this.toolStatusEl.setText(message);
  }

  private renderHeader() {
    const header = this.parsedHeader;
    const stateText = header ? `State: ${header.state}` : `State: ${this.stateMachine.state}`;
    this.headerEl.setText(stateText);
  }

  private renderConfirmation() {
    const needsConfirmation = this.parsedHeader?.needsConfirmation ?? false;
    if (needsConfirmation && !this.stateMachine.canAct()) {
      this.confirmWrapper.show();
      this.confirmBtn.removeAttribute('disabled');
    } else {
      this.confirmWrapper.hide();
    }
  }

  private renderEditPreview() {
    const pending = this.toolRunner.getPendingEdit();
    if (!pending) {
      this.editPreviewWrapper.hide();
      return;
    }
    const body = this.editPreviewWrapper.querySelector('.agentic-chat-edit-body');
    if (body) {
      body.setText(`Lines ${pending.preview.startLine}-${pending.preview.endLine}\n---\n${pending.preview.before}\n---\n${pending.preview.after}`);
    }
    this.editPreviewWrapper.show();
  }

  private pushMessage(role: Message['role'], text: string, header?: string) {
    this.messages.push({ role, text, header, headerExpanded: false });
    this.renderMessages();
  }

  private updateLastAssistantMessage(text: string) {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant') {
      last.text = text;
      const headerParts = this.extractHeader(text);
      if (headerParts) {
        last.header = headerParts.header;
        last.text = headerParts.body;
      }
    }
    this.renderMessages();
  }

  private async handleSend() {
    if (this.loading) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;

    if (this.toolRunner.getPendingEdit()) {
      this.toolRunner.clearPendingEdit();
      this.renderEditPreview();
    }

    this.pushMessage('user', prompt);
    this.inputEl.value = '';
    this.setLoading(true);

    await this.saveActiveChat();

    try {
      const coreRules = await this.ruleManager.loadCore();
      const memory = await this.ruleManager.loadMemory();
      const activeNote = this.includeActiveNoteToggle.checked
        ? await this.getActiveNoteContent()
        : undefined;

      const assembledPrompt = buildPrompt({
        userMessage: prompt,
        settings: this.settings,
        coreRules,
        memory,
        activeNote,
        tools: this.toolRegistry.listTools()
      });

      let assistantText = '';
      this.pushMessage('assistant', '');
      const result = await this.modelClient.generateStream(assembledPrompt, (delta) => {
        assistantText += delta;
        this.updateLastAssistantMessage(assistantText);
      });

      this.parsedHeader = result.header;
      this.applyState(result.header.state || 'idle');
      this.stateMachine.setNeedsConfirmation(result.header.needsConfirmation);
      await this.saveActiveChat();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.pushMessage('system', `Error: ${msg}`);
    } finally {
      this.setLoading(false);
      this.refreshUI();
    }
  }

  private async getActiveNoteContent(): Promise<string | undefined> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return undefined;
    return this.app.vault.read(file);
  }

  private handleConfirm() {
    this.stateMachine.confirm();
    this.refreshUI();
  }

  private async confirmPendingEdit() {
    await this.toolRunner.confirmPendingEdit();
    this.renderEditPreview();
    await this.saveActiveChat();
  }

  private rejectPendingEdit() {
    this.toolRunner.clearPendingEdit();
    this.renderEditPreview();
  }

  private async loadChatIndex() {
    this.chatIndex = await this.chatStore.loadIndex();
    if (this.chatIndex.length === 0) {
      const record = this.chatStore.createChat('New Chat');
      await this.chatStore.saveChat(record);
      this.chatIndex = [record.meta];
    }
    const active = this.chatIndex[0];
    await this.switchChat(active.id);
  }

  private renderChatOptions() {
    this.chatSelect.empty();
    this.chatIndex.forEach((chat) => {
      const option = this.chatSelect.createEl('option', { text: chat.title, value: chat.id });
      if (chat.id === this.activeChatId) {
        option.selected = true;
      }
    });
  }

  private async switchChat(chatId: string) {
    if (!chatId) return;
    const record = await this.chatStore.loadChat(chatId);
    const restored = restoreChatState(record);
    this.activeChatId = record.meta.id;
    this.settings = restored.settings;
    this.parsedHeader = restored.state.header;
    this.stateMachine.setState(restored.state.state || 'idle');
    this.messages = restored.messages;
    this.includeActiveNoteToggle.checked = this.settings.includeActiveNote;
    this.renderChatOptions();
    this.refreshUI();
  }

  private async createNewChat() {
    const record = this.chatStore.createChat('New Chat');
    await this.chatStore.saveChat(record);
    this.chatIndex = await this.chatStore.loadIndex();
    await this.switchChat(record.meta.id);
  }

  private async deleteCurrentChat() {
    if (!this.activeChatId) return;
    await this.chatStore.deleteChat(this.activeChatId);
    this.chatIndex = await this.chatStore.loadIndex();
    if (this.chatIndex.length === 0) {
      await this.createNewChat();
      return;
    }
    await this.switchChat(this.chatIndex[0].id);
  }

  private exitChat() {
    this.messages = [];
    this.activeChatId = null;
    this.refreshUI();
  }

  private async saveActiveChat() {
    if (!this.activeChatId) return;
    const record: ChatRecord = {
      meta: {
        id: this.activeChatId,
        title: this.chatIndex.find((chat) => chat.id === this.activeChatId)?.title ?? 'Chat',
        createdAt: this.chatIndex.find((chat) => chat.id === this.activeChatId)?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      settings: this.settings,
      state: { header: this.parsedHeader, state: this.stateMachine.state },
      messages: this.messages
    };
    await this.chatStore.saveChat(record);
    this.chatIndex = await this.chatStore.loadIndex();
    this.renderChatOptions();
  }

  private extractHeader(text: string): { header: string; body: string } | null {
    const lines = text.split(/\r?\n/);
    if (lines.length < 3) return null;
    const headerLines = lines.slice(0, 3);
    const isHeader = headerLines.every((line) =>
      line.startsWith('STATE:') || line.startsWith('NEEDS_CONFIRMATION:') || line.startsWith('PROPOSED_ACTION:')
    );
    if (!isHeader) return null;
    const body = lines.slice(3).join('\n').trimStart();
    return { header: headerLines.join('\n'), body };
  }

  updateSettings(settings: AstraCodexSettings) {
    this.settings = settings;
    this.modelClient = new ModelClient(this.settings);
    this.includeActiveNoteToggle.checked = this.settings.includeActiveNote;
    this.refreshUI();
  }

  private async loadStateConfiguration() {
    const core = await this.ruleManager.loadCore();
    const parsed = this.parseStates(core.states);
    const allowed = parsed.allowedStates.length ? parsed.allowedStates : ['idle', 'thinking', 'acting'];
    this.stateMap = parsed.stateMap;
    this.stateMachine = new StateMachine(allowed, allowed[0], this.stateMap);
  }

  private parseStates(statesText: string): { allowedStates: string[]; stateMap: Record<string, string> } {
    const allowedStates: string[] = [];
    const stateMap: Record<string, string> = {};

    const mappingMatch = statesText.match(/\[(.+?)\]/s);
    if (mappingMatch) {
      const mappingContent = mappingMatch[1];
      mappingContent.split(',').forEach((pair) => {
        const [key, value] = pair.split(':').map((entry) => entry.trim());
        if (key && value) {
          stateMap[key] = value;
          if (!allowedStates.includes(key)) {
            allowedStates.push(key);
          }
          if (!allowedStates.includes(value)) {
            allowedStates.push(value);
          }
        }
      });
    }

    const bulletMatches = statesText.match(/^-\s+([a-zA-Z_]+)\s+/gm) ?? [];
    bulletMatches.forEach((line) => {
      const match = line.match(/^-\s+([a-zA-Z_]+)/);
      if (match) {
        const state = match[1];
        if (!allowedStates.includes(state)) {
          allowedStates.push(state);
        }
      }
    });

    return { allowedStates, stateMap };
  }

  private applyState(state: string) {
    const resolved = this.stateMachine.resolveState(state);
    if (!resolved) {
      this.stateMachine.setState('idle');
      return;
    }
    try {
      this.stateMachine.setState(resolved);
    } catch (error) {
      console.warn('Unknown state from model, falling back to idle', state, error);
      this.stateMachine.setState('idle');
    }
  }
}
