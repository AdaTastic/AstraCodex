import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Message } from './types';

export const VIEW_TYPE_AGENTIC_CHAT = 'agentic-chat-view';

const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const MODEL = 'qwen2.5:32b-instruct';
const LOADING_TIMEOUT_MS = 20000;

export class AgenticChatView extends ItemView {
  private messages: Message[] = [];
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private statusEl!: HTMLDivElement;
  private transcriptEl!: HTMLDivElement;
  private loading = false;
  private loadingTimer: number | null = null;

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

    const transcriptWrapper = container.createDiv('agentic-chat-transcript-wrapper');
    this.transcriptEl = transcriptWrapper.createDiv('agentic-chat-transcript');

    const inputWrapper = container.createDiv('agentic-chat-input-wrapper');
    this.inputEl = inputWrapper.createEl('textarea', { cls: 'agentic-chat-input', attr: { rows: '3', placeholder: 'Ask or instruct the assistant…' } });
    this.sendBtn = inputWrapper.createEl('button', { cls: 'agentic-chat-send-btn', text: 'Send' });
    this.statusEl = container.createDiv('agentic-chat-status');

    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.inputEl.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && (evt.metaKey || evt.ctrlKey)) {
        evt.preventDefault();
        this.handleSend();
      }
    });
    this.inputEl.addEventListener('input', () => this.updateControls());
    this.inputEl.addEventListener('keyup', () => this.updateControls());

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
  }

  private renderMessages() {
    (this.transcriptEl as any).empty();
    for (const msg of this.messages) {
      const row = (this.transcriptEl as any).createDiv({ cls: ['agentic-chat-row', `role-${msg.role}`] });
      const bubble = row.createDiv({ cls: 'agentic-chat-bubble' });
      const label = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : 'System';
      bubble.createDiv({ cls: 'agentic-chat-label', text: label });
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

  private pushMessage(role: Message['role'], text: string) {
    this.messages.push({ role, text });
    this.renderMessages();
  }

  private async handleSend() {
    if (this.loading) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;

    this.pushMessage('user', prompt);
    this.inputEl.value = '';
    this.setLoading(true);

    try {
      const body = { model: MODEL, prompt, stream: false };
      const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const reply = data?.response ?? '(no response)';
      this.pushMessage('assistant', reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.pushMessage('system', `Error: ${msg}`);
    } finally {
      this.setLoading(false);
    }
  }
}
