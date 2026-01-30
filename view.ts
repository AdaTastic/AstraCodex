import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Message, ParsedHeader } from './types';
import { AstraCodexSettings, defaultSettings } from './settings';
import { RuleManager } from './ruleManager';
import { buildPrompt } from './promptBuilder';
import { StateMachine } from './stateMachine';
import { ModelClient } from './modelClient';
import { ToolRunner } from './toolRunner';
import { ToolRegistry } from './toolRegistry';
import { ChatStore, ChatMeta } from './chatStore';
import { mergeChatSettings, restoreChatState } from './chatSession';
import * as ChatManager from './chatManager';
import { runAgentLoop } from './agentLoop';
import { extractFencedToolCall, isExtractionError } from './toolOrchestrator';
import { buildConversationHistory } from './conversationHistory';
// Extracted modules
import { extractHeaderAndBody, extractLastReadPath } from './textParser';
import { renderMessages as renderMessagesUtil, updateLastAssistantMessage as updateLastAssistantMessageUtil, pushMessage as pushMessageUtil } from './messageRenderer';

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
  private loadedRules: Record<string, string> = {};
  private loading = false;
  private loadingTimer: number | null = null;
  private abortController: AbortController | null = null;
  private settings = defaultSettings();
  private stateMachine = new StateMachine(['idle', 'thinking', 'acting']);
  private stateMap: Record<string, string> = {};
  private parsedHeader: ParsedHeader | null = null;
  private activeChatId: string | null = null;
  private chatIndex: ChatMeta[] = [];
  private hasNamedActiveChat = false;
  private ruleManager = new RuleManager({
    read: (path) => this.app.vault.adapter.read(path),
    list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
      ...list.files,
      ...list.folders.map(f => f.endsWith('/') ? f : f + '/')
    ])
  });
  private chatStore = new ChatStore({
    read: (path) => this.app.vault.adapter.read(path),
    write: (path, content) => this.app.vault.adapter.write(path, content),
    remove: (path) => this.app.vault.adapter.remove(path),
    exists: (path) => this.app.vault.adapter.exists(path),
    list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
      ...list.files,
      ...list.folders.map(f => f.endsWith('/') ? f : f + '/')
    ])
  });
  private toolRegistry = new ToolRegistry({
    read: (path) => this.app.vault.adapter.read(path),
    list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
      ...list.files,
      ...list.folders.map(f => f.endsWith('/') ? f : f + '/')
    ])
  });
  private modelClient = new ModelClient(this.settings);
  private toolRunner = new ToolRunner(
    {
      read: (path) => this.app.vault.adapter.read(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
        ...list.files,
        ...list.folders.map(f => f.endsWith('/') ? f : f + '/')
      ]),
      write: (path, content) => this.app.vault.adapter.write(path, content),
      append: (path, content) => this.app.vault.adapter.append(path, content)
    },
    () => this.stateMachine.canAct(),
    undefined,
    this.toolRegistry,
    (message) => this.renderToolStatus(message),
    () => this.app.workspace.getActiveFile()?.path ?? null
  );

  constructor(leaf: WorkspaceLeaf, initialSettings?: AstraCodexSettings) {
    super(leaf);
    if (initialSettings) {
      this.settings = initialSettings;
      this.modelClient = new ModelClient(this.settings);
    }
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

    // Keep the setting (includeActiveNote) but remove the UI checkbox.

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
      // Enter sends; Shift+Enter inserts a newline.
      if (evt.key === 'Enter' && !evt.shiftKey) {
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
    // no checkbox
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
    if (!flag) {
      this.abortController = null;
    }
    if (flag) {
      this.loadingTimer = window.setTimeout(() => {
        this.loading = false;
        this.abortController = null;
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
    // Use the shared messageRenderer module for consistent rendering
    renderMessagesUtil(
      this.messages,
      this.transcriptEl,
      (index) => this.handleToggleHeader(index),
      (index) => this.handleToggleThink(index),
      { preserveScroll: true }
    );
  }

  private handleToggleHeader(index: number) {
    const msg = this.messages[index];
    if (msg) {
      msg.headerExpanded = !msg.headerExpanded;
      this.renderMessages();
    }
  }

  private handleToggleThink(index: number) {
    const msg = this.messages[index];
    if (msg) {
      msg.thinkExpanded = !msg.thinkExpanded;
      this.renderMessages();
    }
  }

  private updateControls() {
    const trimmed = this.inputEl.value.trim();
    (this.sendBtn as any).toggleClass('is-loading', this.loading);
    this.sendBtn.setText(this.loading ? 'Cancel' : 'Send');
    if (this.loading || trimmed.length === 0) {
      if (this.loading) {
        this.sendBtn.removeAttribute('disabled');
        this.statusEl.setText('Sending...');
      } else {
        (this.sendBtn as any).setAttr('disabled', 'true');
        this.statusEl.setText('Disabled: enter text');
      }
    } else {
      this.sendBtn.removeAttribute('disabled');
      this.statusEl.setText('Ready');
    }
  }

  private cancelInFlight() {
    if (!this.abortController) return;
    try {
      this.abortController.abort();
    } catch {
      // ignore
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

  private pushMessage(role: Message['role'], content: string) {
    pushMessageUtil(this.messages, role, content);
    this.renderMessages();
  }

  private updateLastAssistantMessage(rawText: string) {
    // Use messageRenderer's comprehensive parsing (sets segments, activityLine, text, etc.)
    updateLastAssistantMessageUtil(this.messages, rawText, this.parsedHeader);
    
    // Also extract tool_calls for the agent loop
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant') {
      const extracted = extractFencedToolCall(rawText);
      if (extracted && !isExtractionError(extracted)) {
        last.tool_calls = [{
          name: extracted.toolCall.name,
          arguments: extracted.toolCall.arguments ?? {}
        }];
      }
    }
    this.renderMessages();
  }

  private async handleSend() {
    if (this.loading) {
      this.cancelInFlight();
      return;
    }
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;

    if (this.toolRunner.getPendingEdit()) {
      this.toolRunner.clearPendingEdit();
      this.renderEditPreview();
    }

    this.pushMessage('user', prompt);
    await this.ensureChatNamed(prompt);
    this.inputEl.value = '';
    this.setLoading(true);
    this.abortController = new AbortController();

    await this.saveActiveChat();

    try {
      // Reload tools each send so newly added tool scripts are immediately available.
      await this.toolRegistry.loadTools();

      const coreRules = await this.ruleManager.loadCore();
      const memory = await this.ruleManager.loadMemory();
      await this.ensureBaseRulesLoaded();
      const activeNote = this.settings.includeActiveNote ? await this.getActiveNoteContent() : undefined;

      const buildChatPrompt = (history: Message[]) => {
        // Get the latest user message from history
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
        const userMessage = lastUserMsg?.content ?? '';

        // 1) Compute fixed prompt length with no history
        const fixed = buildPrompt({
          userMessage,
          settings: this.settings,
          coreRules,
          rules: this.loadedRules,
          memory,
          history: '',
          activeNote,
          tools: this.toolRegistry.listTools()
        });

        // 2) Budget remaining space for conversation history (OpenAI JSON format)
        const historyBudget = Math.max(0, this.settings.maxContextChars - fixed.length);
        const historyJson = buildConversationHistory(history, historyBudget, { excludeLatestUserMessage: true });

        // 3) Build final prompt with history
        return buildPrompt({
          userMessage,
          settings: this.settings,
          coreRules,
          rules: this.loadedRules,
          memory,
          history: historyJson,
          activeNote,
          tools: this.toolRegistry.listTools()
        });
      };

      let assistantText = '';

      const result = await runAgentLoop({
        history: this.messages,
        buildPrompt: buildChatPrompt,
        model: this.modelClient,
        toolRunner: this.toolRunner,
        signal: this.abortController.signal,
        callbacks: {
          onTurnStart: ({ turn, history }) => {
            // Don't overwrite - we share the same array reference with agent loop
            // The agent loop mutates history directly, and this.messages IS that array
            this.renderMessages();
          },
          onAssistantStart: () => {
            assistantText = '';
          },
          onAssistantDelta: (delta) => {
            assistantText += delta;
            this.updateLastAssistantMessage(assistantText);
          },
          onToolResult: ({ name, result }) => {
            // If a rule file was read, cache it into loadedRules.
            if (name === 'read') {
              const readPath = extractLastReadPath(assistantText);
              if (readPath?.startsWith('AstraCodex/Rules/') && typeof result === 'string') {
                const ruleName = readPath.split('/').pop()?.replace(/\.md$/, '') ?? readPath;
                this.loadedRules[ruleName] = result;
              }
            }
            
            // Update state machine based on the last assistant message header.
            const { header } = extractHeaderAndBody(assistantText);
            if (header) {
              const stateMatch = header.match(/STATE:\s*([a-zA-Z_]+)/);
              const needsConfirmMatch = header.match(/NEEDS_CONFIRMATION:\s*(true|false)/);
              if (stateMatch) {
                const newState = stateMatch[1];
                this.applyState(newState);
              }
              if (needsConfirmMatch) {
                this.stateMachine.setNeedsConfirmation(needsConfirmMatch[1] === 'true');
              }
            }
          },
          onMessageAdded: (message) => {
            // Keep UI in sync with agent loop messages
            this.renderMessages();
          }
        }
      });

      this.parsedHeader = result.header;
      this.applyState(result.header.state || 'idle');
      this.stateMachine.setNeedsConfirmation(result.header.needsConfirmation);
      await this.saveActiveChat();
    } catch (err) {
      // User cancelled.
      if (err && typeof err === 'object' && (err as any).name === 'AbortError') {
        this.pushMessage('system', 'Cancelled.');
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.pushMessage('system', `Error: ${msg}`);
    } finally {
      this.setLoading(false);
      this.refreshUI();
    }
  }

  private async ensureBaseRulesLoaded() {
    if (this.loadedRules.tool_protocol) return;
    const base = await this.ruleManager.loadRules([
      'tool_protocol',
      'file_inspection',
      'rules_index',
      'consent_and_modes',
      'memory_policy',
      'uncertainty'
    ]);
    this.loadedRules = { ...this.loadedRules, ...base };
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
    const { index, firstChatId } = await ChatManager.loadChatIndex(this.chatStore, this.settings);
    this.chatIndex = index;
    await this.switchChat(firstChatId);
  }

  private renderChatOptions() {
    ChatManager.renderChatOptions(this.chatSelect, this.chatIndex, this.activeChatId);
  }

  private async switchChat(chatId: string) {
    if (!chatId) return;
    const record = await this.chatStore.loadChat(chatId);
    const restored = restoreChatState(record);
    this.activeChatId = record.meta.id;
    // Merge per-chat settings but keep global model/baseUrl from the view's current settings.
    this.settings = mergeChatSettings(this.settings, restored.settings);
    this.parsedHeader = restored.state.header;
    this.stateMachine.setState(restored.state.state || 'idle');
    this.messages = restored.messages;
    this.hasNamedActiveChat = (record.meta.title ?? '').trim() !== '' && record.meta.title !== 'New Chat';
    // no checkbox
    this.loadedRules = {};
    this.renderChatOptions();
    this.refreshUI();
  }

  private async createNewChat() {
    const { index, newChatId } = await ChatManager.createNewChat(this.chatStore, this.settings);
    this.chatIndex = index;
    await this.switchChat(newChatId);
  }

  private async deleteCurrentChat() {
    if (!this.activeChatId) return;
    this.chatIndex = await ChatManager.deleteChat(this.chatStore, this.activeChatId);
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
    this.chatIndex = await ChatManager.saveChat(this.chatStore, {
      activeChatId: this.activeChatId,
      chatIndex: this.chatIndex,
      settings: this.settings,
      parsedHeader: this.parsedHeader,
      stateMachineState: this.stateMachine.state,
      messages: this.messages,
      lastDocument: null
    });
    this.renderChatOptions();
  }

  updateSettings(settings: AstraCodexSettings) {
    // Global settings update (model/baseUrl/etc). Keep current chat's non-global overrides.
    this.settings = mergeChatSettings(settings, this.settings);
    this.modelClient = new ModelClient(this.settings);
    // no checkbox
    this.refreshUI();
  }

  private async ensureChatNamed(firstUserMessage: string) {
    const result = await ChatManager.ensureChatNamed(
      this.chatStore,
      this.chatIndex,
      this.activeChatId,
      this.hasNamedActiveChat,
      firstUserMessage
    );
    this.chatIndex = result.chatIndex;
    this.hasNamedActiveChat = result.hasNamedActiveChat;
    this.renderChatOptions();
  }

  private async loadStateConfiguration() {
    const core = await this.ruleManager.loadCore();
    const parsed = this.parseStates(core.states);
    // Always include base states to prevent "Invalid state" errors
    const baseStates = ['idle', 'thinking', 'acting', 'completed'];
    const allowed = [...new Set([...baseStates, ...parsed.allowedStates])];
    this.stateMap = parsed.stateMap;
    this.stateMachine = new StateMachine(allowed, 'idle', this.stateMap);
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
