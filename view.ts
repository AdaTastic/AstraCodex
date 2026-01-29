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
import { mergeChatSettings, restoreChatState } from './chatSession';
import { deriveChatTitle } from './chatTitle';
import { runAgentLoop } from './agentLoop';
import { extractFencedToolCall, formatToolActivity, stripToolBlocks, isExtractionError } from './toolOrchestrator';
import { buildConversationHistory } from './conversationHistory';
// Extracted modules
import { extractThink, extractHeaderAndBody, extractFinal, extractRetriggerMessage, extractLastReadPath, parseStateFromHeader } from './textParser';
import { renderMessages as renderMessagesUtil, updateLastAssistantMessage as updateLastAssistantMessageUtil, pushMessage as pushMessageUtil } from './messageRenderer';
import * as ChatManager from './chatManager';

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
  private activityLine: string | null = null;
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
  private lastDocument: { path: string; content: string } | null = null;
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

      if (msg.role === 'assistant' && msg.think) {
        const thinkToggle = bubble.createDiv({
          cls: 'agentic-chat-header-toggle',
          text: msg.thinkExpanded ? 'Think ▾' : 'Think ▸'
        });
        thinkToggle.addEventListener('click', () => {
          msg.thinkExpanded = !msg.thinkExpanded;
          this.renderMessages();
        });

        if (msg.thinkExpanded) {
          bubble.createDiv({ cls: 'agentic-chat-header-text', text: msg.think });
        }
      }

      const displayText =
        msg.text && msg.text.trim().length > 0
          ? msg.text
          : msg.role === 'assistant' && msg.think
            ? '(No final answer was produced — expand Think)'
            : msg.text;

      if (msg.role === 'assistant' && msg.activityLine) {
        bubble.createDiv({ cls: 'agentic-chat-tool-activity', text: msg.activityLine });
      }

      bubble.createDiv({ cls: 'agentic-chat-text', text: displayText });
    }
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
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

  private pushMessage(role: Message['role'], text: string, header?: string) {
    this.messages.push({ role, text, header, headerExpanded: false });
    this.renderMessages();
  }

  private extractThink(text: string): { think: string | null; rest: string } {
    // Capture the first <think>...</think> block.
    const match = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (!match) return { think: null, rest: text };
    const think = match[1].trim();
    const rest = (text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length)).trim();
    return { think: think || null, rest };
  }

  private extractHeaderAndBody(text: string): { header: string | null; body: string } {
    const lines = text.split(/\r?\n/);
    let stateLine: string | null = null;
    let needsLine: string | null = null;

    // Search within the first N lines for header keys.
    const scanLimit = Math.min(lines.length, 60);
    for (let i = 0; i < scanLimit; i++) {
      const line = lines[i].trim();
      if (!stateLine && line.startsWith('STATE:')) stateLine = line;
      if (!needsLine && line.startsWith('NEEDS_CONFIRMATION:')) needsLine = line;
      if (stateLine && needsLine) break;
    }

    const headerLines = [stateLine, needsLine].filter(Boolean) as string[];
    const header = headerLines.length ? headerLines.join('\n') : null;

    // Remove those header lines from the body (first occurrence only).
    let body = text;
    for (const h of headerLines) {
      const idx = body.indexOf(h);
      if (idx !== -1) {
        body = (body.slice(0, idx) + body.slice(idx + h.length)).trim();
      }
    }
    return { header, body };
  }

  private extractFinal(text: string): { final: string | null; body: string } {
    // Prefer explicit FINAL: marker to separate user-facing answer from other output.
    const match = text.match(/(^|\n)\s*FINAL:\s*/);
    if (!match || match.index === undefined) return { final: null, body: text };
    const start = match.index + match[0].length;
    const final = text.slice(start).trim();
    const body = text.slice(0, match.index).trim();
    return { final: final || null, body };
  }

  
  private extractRetriggerMessage(text: string): string | null {
    // Extract retrigger message from STATE: RETRIGGER header.
    const { header } = this.extractHeaderAndBody(text);
    if (!header) return null;
    const retriggerMatch = header.match(/STATE:\s*RETRIGGER\s*(\n)?(.*)/);
    if (retriggerMatch) {
      return retriggerMatch[2]?.trim() ?? null;
    }
    return null;
  }

  private updateLastAssistantMessage(text: string) {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant') {
      // Persist raw model output for debugging and future inspection.
      last.rawText = text;

      // Hide any tool blocks from the visible transcript.
      const extracted = extractFencedToolCall(text);
      this.activityLine = (extracted && !isExtractionError(extracted)) ? formatToolActivity(extracted.toolCall) : null;
      last.activityLine = this.activityLine;

      const withoutToolBlocks = stripToolBlocks(text);
      const { think, rest } = this.extractThink(withoutToolBlocks);
      if (think) {
        last.think = think;
        if (typeof last.thinkExpanded !== 'boolean') last.thinkExpanded = false;
      }

      const { header, body } = this.extractHeaderAndBody(rest);
      const { final } = this.extractFinal(body);
      if (header) {
        last.header = header;
        const chosen = final ?? body;
        last.text = chosen;
      } else if (this.parsedHeader) {
        last.header = `STATE: ${this.parsedHeader.state}\nNEEDS_CONFIRMATION: ${this.parsedHeader.needsConfirmation}`;
        const { final: finalFromRest } = this.extractFinal(rest);
        const chosen = finalFromRest ?? rest;
        last.text = chosen;
      } else {
        const { final: finalFromRest } = this.extractFinal(rest);
        const chosen = finalFromRest ?? rest;
        last.text = chosen;
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

      const buildChatPrompt = (userMessage: string) => {
        // 1) Compute fixed prompt length with no history & no last document.
        const fixed = buildPrompt({
          userMessage,
          settings: this.settings,
          coreRules,
          rules: this.loadedRules,
          memory,
          history: '',
          lastDocument: null,
          activeNote,
          tools: this.toolRegistry.listTools()
        });

        // 2) Decide how much room to reserve for the last document context.
        const docContent = this.lastDocument?.content ?? '';
        const docPath = this.lastDocument?.path ?? 'unknown';
        const docHeader = docContent.trim()
          ? `Last Document Context (${docPath}):\n`
          : '';

        const maxDocChars = Math.min(4000, Math.max(500, Math.floor(this.settings.maxContextChars / 2)));
        const docSection = docContent.trim()
          ? { path: docPath, content: docContent.slice(0, maxDocChars) }
          : null;

        // 3) Budget remaining space for conversation history.
        const fixedWithDoc = buildPrompt({
          userMessage,
          settings: this.settings,
          coreRules,
          rules: this.loadedRules,
          memory,
          history: '', // FIX: Pass actual history
          lastDocument: docSection,
          activeNote,
          tools: this.toolRegistry.listTools()
        });
        const historyBudget = Math.max(0, this.settings.maxContextChars - fixedWithDoc.length);
        const history = buildConversationHistory(this.messages, historyBudget, { excludeLatestUserMessage: true });

        // 4) Build final prompt including both history and last document.
        return buildPrompt({
          userMessage,
          settings: this.settings,
          coreRules,
          rules: this.loadedRules,
          memory,
          history, // FIX: Pass actual history
          lastDocument: docSection,
          activeNote,
          tools: this.toolRegistry.listTools()
        });
      };

      let assistantText = '';

      const result = await runAgentLoop({
        initialUserMessage: prompt,
        buildPrompt: buildChatPrompt,
        model: this.modelClient,
        toolRunner: this.toolRunner,
        signal: this.abortController.signal,
        callbacks: {
          onTurnStart: ({ turn }) => {
            // Create a new assistant bubble per turn so retriggers don't overwrite.
            this.pushMessage('assistant', '');
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
              const readPath = this.extractLastReadPath(assistantText);
              if (readPath?.startsWith('AstraCodex/Rules/') && typeof result === 'string') {
                const ruleName = readPath.split('/').pop()?.replace(/\.md$/, '') ?? readPath;
                this.loadedRules[ruleName] = result;
              } else if (typeof result === 'string') {
                // Store last non-rules document context for follow-up questions.
                // Keep it small enough to reliably fit inside maxContextChars.
                const maxDocChars = Math.min(4000, Math.max(500, Math.floor(this.settings.maxContextChars / 2)));
                this.lastDocument = {
                  path: readPath ?? 'unknown',
                  content: result.slice(0, maxDocChars)
                };
              }
            }
            
            // Update state machine based on the last assistant message header.
            const { header } = this.extractHeaderAndBody(assistantText);
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
            
            // Handle retrigger messages.
            const retriggerMessage = this.extractRetriggerMessage(assistantText);
            if (retriggerMessage) {
              // Only process retrigger if state machine allows action.
              if (this.stateMachine.canAct()) {
                // Send the retrigger message back to the model.
                this.pushMessage('user', retriggerMessage);
              } else {
                // Can't act, tell the model to try again with a valid state.
                this.pushMessage('assistant', 'I can\'t complete that action right now. Please let me know what state I should be in to proceed.');
              }
            }
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

  private extractLastReadPath(text: string): string | null {
    // Looks for a fenced tool block and returns args.path if present.
    const match = text.match(/```tool\s*([\s\S]*?)```/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[1]);
      const path = parsed?.args?.path;
      return typeof path === 'string' ? path : null;
    } catch {
      return null;
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
      const record = this.chatStore.createChat('New Chat', this.settings);
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
    // Merge per-chat settings but keep global model/baseUrl from the view's current settings.
    this.settings = mergeChatSettings(this.settings, restored.settings);
    this.parsedHeader = restored.state.header;
    this.stateMachine.setState(restored.state.state || 'idle');
    this.messages = restored.messages;
    this.lastDocument = restored.lastDocument ?? null;
    this.hasNamedActiveChat = (record.meta.title ?? '').trim() !== '' && record.meta.title !== 'New Chat';
    // no checkbox
    this.loadedRules = {};
    this.renderChatOptions();
    this.refreshUI();
  }

  private async createNewChat() {
    const record = this.chatStore.createChat('New Chat', this.settings);
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
      messages: this.messages,
      lastDocument: this.lastDocument
    };
    await this.chatStore.saveChat(record);
    this.chatIndex = await this.chatStore.loadIndex();
    this.renderChatOptions();
  }

  // Legacy fixed-line header extractor removed; we now parse keys directly.

  updateSettings(settings: AstraCodexSettings) {
    // Global settings update (model/baseUrl/etc). Keep current chat's non-global overrides.
    this.settings = mergeChatSettings(settings, this.settings);
    this.modelClient = new ModelClient(this.settings);
    // no checkbox
    this.refreshUI();
  }

  private async ensureChatNamed(firstUserMessage: string) {
    if (!this.activeChatId) return;
    if (this.hasNamedActiveChat) return;

    const title = deriveChatTitle(firstUserMessage, 50);
    const meta = this.chatIndex.find((c) => c.id === this.activeChatId);
    if (!meta) return;
    if (meta.title === title) {
      this.hasNamedActiveChat = true;
      return;
    }
    meta.title = title;
    meta.updatedAt = new Date().toISOString();
    await this.chatStore.saveIndex(this.chatIndex);
    this.hasNamedActiveChat = true;
    this.renderChatOptions();
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
