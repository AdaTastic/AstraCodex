"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AstraCodexPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// view.ts
var import_obsidian = require("obsidian");
var VIEW_TYPE_AGENTIC_CHAT = "agentic-chat-view";
var OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
var MODEL = "qwen2.5:32b-instruct";
var LOADING_TIMEOUT_MS = 2e4;
var AgenticChatView = class extends import_obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
    this.messages = [];
    this.loading = false;
    this.loadingTimer = null;
  }
  getViewType() {
    return VIEW_TYPE_AGENTIC_CHAT;
  }
  getDisplayText() {
    return "AstraCodex";
  }
  getIcon() {
    return "message-circle";
  }
  async onOpen() {
    const container = this.containerEl;
    container.empty();
    container.addClass("agentic-chat-view");
    const header = container.createDiv("agentic-chat-header");
    header.createEl("h4", { text: "AstraCodex" });
    const transcriptWrapper = container.createDiv("agentic-chat-transcript-wrapper");
    this.transcriptEl = transcriptWrapper.createDiv("agentic-chat-transcript");
    const inputWrapper = container.createDiv("agentic-chat-input-wrapper");
    this.inputEl = inputWrapper.createEl("textarea", { cls: "agentic-chat-input", attr: { rows: "3", placeholder: "Ask or instruct the assistant\u2026" } });
    this.sendBtn = inputWrapper.createEl("button", { cls: "agentic-chat-send-btn", text: "Send" });
    this.statusEl = container.createDiv("agentic-chat-status");
    this.sendBtn.addEventListener("click", () => this.handleSend());
    this.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
        evt.preventDefault();
        this.handleSend();
      }
    });
    this.inputEl.addEventListener("input", () => this.updateControls());
    this.inputEl.addEventListener("keyup", () => this.updateControls());
    this.refreshUI();
  }
  async onClose() {
    this.clearLoadingTimer();
  }
  setLoading(flag) {
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
  clearLoadingTimer() {
    if (this.loadingTimer !== null) {
      window.clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
  }
  refreshUI() {
    this.renderMessages();
    this.updateControls();
  }
  renderMessages() {
    this.transcriptEl.empty();
    for (const msg of this.messages) {
      const row = this.transcriptEl.createDiv({ cls: ["agentic-chat-row", `role-${msg.role}`] });
      const bubble = row.createDiv({ cls: "agentic-chat-bubble" });
      const label = msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : "System";
      bubble.createDiv({ cls: "agentic-chat-label", text: label });
      bubble.createDiv({ cls: "agentic-chat-text", text: msg.text });
    }
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }
  updateControls() {
    const trimmed = this.inputEl.value.trim();
    this.sendBtn.toggleClass("is-loading", this.loading);
    if (this.loading || trimmed.length === 0) {
      this.sendBtn.setAttr("disabled", "true");
      this.statusEl.setText(this.loading ? "Sending..." : "Disabled: enter text");
    } else {
      this.sendBtn.removeAttribute("disabled");
      this.statusEl.setText("Ready");
    }
  }
  pushMessage(role, text) {
    this.messages.push({ role, text });
    this.renderMessages();
  }
  async handleSend() {
    var _a;
    if (this.loading) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;
    this.pushMessage("user", prompt);
    this.inputEl.value = "";
    this.setLoading(true);
    try {
      const body = { model: MODEL, prompt, stream: false };
      const res = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error ${res.status}: ${text}`);
      }
      const data = await res.json();
      const reply = (_a = data == null ? void 0 : data.response) != null ? _a : "(no response)";
      this.pushMessage("assistant", reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.pushMessage("system", `Error: ${msg}`);
    } finally {
      this.setLoading(false);
    }
  }
};

// main.ts
var AstraCodexPlugin = class extends import_obsidian2.Plugin {
  async onload() {
    this.registerView(
      VIEW_TYPE_AGENTIC_CHAT,
      (leaf) => new AgenticChatView(leaf)
    );
    this.addCommand({
      id: "open-astracodex-chat-view",
      name: "Open AstraCodex Chat Panel",
      callback: () => this.activateView()
    });
    this.addRibbonIcon("message-circle", "Open AstraCodex Chat Panel", () => {
      this.activateView();
    });
  }
  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENTIC_CHAT).forEach((leaf) => leaf.detach());
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_AGENTIC_CHAT).first();
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_AGENTIC_CHAT, active: true });
    }
    workspace.revealLeaf(leaf);
  }
};
