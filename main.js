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

// settings.ts
var DEFAULT_SETTINGS = {
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5:32b-instruct",
  includeActiveNote: false,
  maxContextChars: 8e3,
  maxMemoryChars: 2e3
};
var defaultSettings = () => ({ ...DEFAULT_SETTINGS });
var mergeSettings = (overrides) => {
  return { ...DEFAULT_SETTINGS, ...overrides != null ? overrides : {} };
};

// ruleManager.ts
var RuleManager = class {
  constructor(adapter) {
    this.paths = {
      charter: "AstraCodex/charter.md",
      states: "AstraCodex/states.md",
      voice: "AstraCodex/voice.md",
      memory: "AstraCodex/Memory.md",
      rulesDir: "AstraCodex/Rules/"
    };
    this.adapter = adapter;
  }
  async loadCore() {
    const [charter, states, voice] = await Promise.all([
      this.safeRead(this.paths.charter),
      this.safeRead(this.paths.states),
      this.safeRead(this.paths.voice)
    ]);
    return { charter, states, voice };
  }
  async loadMemory() {
    return this.safeRead(this.paths.memory);
  }
  async loadRules(names) {
    const entries = await Promise.all(
      names.map(async (name) => {
        const normalized = name.endsWith(".md") ? name : `${name}.md`;
        const content = await this.safeRead(`${this.paths.rulesDir}${normalized}`);
        return [name.replace(/\.md$/, ""), content];
      })
    );
    return Object.fromEntries(entries);
  }
  async listRuleFiles() {
    return this.adapter.list(this.paths.rulesDir);
  }
  async safeRead(path) {
    try {
      return await this.adapter.read(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Missing file: ${path}. (${message})`;
    }
  }
};

// promptBuilder.ts
var HEADER_REMINDER = `You MUST respond with a header in the format:
STATE: <state>
NEEDS_CONFIRMATION: <true|false>
PROPOSED_ACTION: <short description>
`;
var clamp = (value, maxChars) => {
  if (maxChars <= 0) return "";
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
};
var buildPrompt = ({
  userMessage,
  settings,
  coreRules,
  voiceOverride,
  rules,
  memory,
  activeNote,
  selection,
  tools
}) => {
  const sections = [];
  sections.push(HEADER_REMINDER.trim());
  sections.push(`Charter:
${coreRules.charter}`);
  sections.push(`States:
${coreRules.states}`);
  const voice = voiceOverride != null ? voiceOverride : coreRules.voice;
  if (voice == null ? void 0 : voice.trim()) {
    sections.push(`Voice:
${voice}`);
  }
  if (rules && Object.keys(rules).length) {
    const rulesBlock = Object.entries(rules).map(([name, content]) => `Rule: ${name}
${content}`).join("\n\n");
    sections.push(`Rules:
${rulesBlock}`);
  }
  if (tools && tools.length > 0) {
    const toolBlock = tools.map((tool) => {
      const params = tool.params ? JSON.stringify(tool.params) : "{}";
      return `${tool.name}: ${tool.description} (params: ${params})`;
    }).join("\n");
    sections.push(`Tools:
${toolBlock}`);
  }
  if (memory == null ? void 0 : memory.trim()) {
    const trimmedMemory = memory.trim();
    if (trimmedMemory.length > 0) {
      sections.push(`Memory:
${clamp(trimmedMemory, settings.maxMemoryChars)}`);
    }
  }
  if (activeNote == null ? void 0 : activeNote.trim()) {
    sections.push(`Active Note:
${activeNote}`);
  }
  if (selection == null ? void 0 : selection.trim()) {
    sections.push(`Selection:
${selection}`);
  }
  sections.push(`User Request:
${userMessage}`);
  const full = sections.join("\n\n");
  return clamp(full, settings.maxContextChars);
};

// stateMachine.ts
var StateMachine = class {
  constructor(states, initialState, stateMap = {}) {
    this.confirmed = false;
    this.needsConfirmation = false;
    if (states.length === 0) {
      throw new Error("StateMachine requires at least one state");
    }
    this.allowedStates = new Set(states);
    this.stateMap = stateMap;
    const fallback = initialState != null ? initialState : states[0];
    if (!this.allowedStates.has(fallback)) {
      throw new Error(`Invalid initial state: ${fallback}`);
    }
    this.state = fallback;
  }
  setState(next) {
    const resolved = this.resolveState(next);
    if (!this.allowedStates.has(resolved)) {
      throw new Error(`Invalid state: ${next}`);
    }
    this.state = resolved;
    if (next !== "acting") {
      this.confirmed = false;
      this.needsConfirmation = false;
    }
  }
  resolveState(next) {
    var _a;
    return (_a = this.stateMap[next]) != null ? _a : next;
  }
  setNeedsConfirmation(flag) {
    this.needsConfirmation = flag;
    if (!flag) {
      this.confirmed = false;
    }
  }
  confirm() {
    if (this.needsConfirmation) {
      this.confirmed = true;
    }
  }
  canAct() {
    if (this.state !== "acting") {
      return true;
    }
    if (!this.needsConfirmation) {
      return true;
    }
    return this.confirmed;
  }
};

// modelClient.ts
var ModelClient = class {
  constructor(settings, fetchImpl) {
    this.settings = settings;
    const baseFetch = fetchImpl != null ? fetchImpl : globalThis.fetch;
    this.fetchImpl = baseFetch ? baseFetch.bind(globalThis) : fetch;
  }
  async generateStream(prompt, onDelta) {
    const url = `${this.settings.baseUrl}/api/generate`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.settings.model, prompt, stream: true })
    });
    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const chunk = JSON.parse(line);
          if (chunk.response) {
            fullText += chunk.response;
            onDelta(chunk.response);
          }
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
    if (buffer.trim()) {
      const chunk = JSON.parse(buffer);
      if (chunk.response) {
        fullText += chunk.response;
        onDelta(chunk.response);
      }
    }
    const header = parseHeader(fullText);
    return { header, text: fullText };
  }
};
var parseHeader = (text) => {
  const header = {
    state: "idle",
    needsConfirmation: false,
    proposedAction: ""
  };
  const lines = text.split(/\r?\n/).slice(0, 6);
  for (const line of lines) {
    if (line.startsWith("STATE:")) {
      header.state = line.replace("STATE:", "").trim() || header.state;
    }
    if (line.startsWith("NEEDS_CONFIRMATION:")) {
      const value = line.replace("NEEDS_CONFIRMATION:", "").trim().toLowerCase();
      header.needsConfirmation = value === "true";
    }
    if (line.startsWith("PROPOSED_ACTION:")) {
      header.proposedAction = line.replace("PROPOSED_ACTION:", "").trim();
    }
  }
  return header;
};

// toolRunner.ts
var ToolRunner = class {
  constructor(adapter, canAct, now = () => (/* @__PURE__ */ new Date()).toISOString(), registry, onToolActivity) {
    this.pendingEdit = null;
    this.adapter = adapter;
    this.canAct = canAct;
    this.now = now;
    this.registry = registry;
    this.onToolActivity = onToolActivity;
  }
  async readFile(path) {
    this.emitActivity(`Reading: ${path}`);
    return this.adapter.read(path);
  }
  async listFiles(prefix) {
    this.emitActivity(`Listing: ${prefix}`);
    return this.adapter.list(prefix);
  }
  async writeFile(path, content) {
    this.ensureCanAct();
    this.emitActivity(`Writing: ${path}`);
    await this.adapter.write(path, content);
  }
  async appendFile(path, content) {
    this.ensureCanAct();
    this.emitActivity(`Appending: ${path}`);
    await this.adapter.append(path, content);
  }
  async appendMemory(label, text) {
    this.ensureCanAct();
    this.emitActivity("Appending memory entry");
    const entry = `- ${this.now()} \u2014 ${label}: ${text}
`;
    await this.adapter.append("AstraCodex/Memory.md", entry);
  }
  async executeTool(name, args) {
    var _a;
    if (!this.registry) {
      throw new Error("Tool registry is not configured.");
    }
    const tool = this.registry.getTool(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    this.emitActivity(`Tool: ${name}`);
    this.validateArgs(args, (_a = tool.meta.params) != null ? _a : {});
    const ctx = {
      vault: this.adapter,
      log: (message) => console.log(`[Tool:${name}] ${message}`)
    };
    return tool.run(args, ctx);
  }
  setPendingEdit(edit) {
    this.pendingEdit = edit;
  }
  getPendingEdit() {
    return this.pendingEdit;
  }
  clearPendingEdit() {
    this.pendingEdit = null;
  }
  async confirmPendingEdit() {
    if (!this.pendingEdit) {
      throw new Error("No pending edit");
    }
    this.ensureCanAct();
    this.emitActivity(`Writing: ${this.pendingEdit.path}`);
    await this.adapter.write(this.pendingEdit.path, this.pendingEdit.updatedContent);
    this.clearPendingEdit();
  }
  ensureCanAct() {
    if (!this.canAct()) {
      throw new Error("Confirmation required to perform write operations.");
    }
  }
  validateArgs(args, params) {
    for (const [key, type] of Object.entries(params)) {
      if (!(key in args)) {
        throw new Error(`Missing parameter: ${key}`);
      }
      if (type === "string" && typeof args[key] !== "string") {
        throw new Error(`Invalid parameter type for ${key}`);
      }
    }
  }
  emitActivity(message) {
    var _a;
    (_a = this.onToolActivity) == null ? void 0 : _a.call(this, message);
  }
};

// toolRegistry.ts
var ToolRegistry = class {
  constructor(adapter) {
    this.tools = /* @__PURE__ */ new Map();
    this.adapter = adapter;
  }
  async loadTools() {
    const files = await this.adapter.list("AstraCodex/Tools");
    const toolFiles = files.filter((file) => file.endsWith(".js"));
    this.tools.clear();
    for (const file of toolFiles) {
      const source = await this.adapter.read(file);
      const module2 = this.evaluateTool(source);
      this.validateTool(module2);
      this.tools.set(module2.meta.name, module2);
    }
  }
  listTools() {
    return Array.from(this.tools.values()).map((tool) => tool.meta);
  }
  getTool(name) {
    return this.tools.get(name);
  }
  evaluateTool(source) {
    const module2 = { exports: {} };
    const wrapper = new Function("module", "exports", source);
    wrapper(module2, module2.exports);
    return module2.exports;
  }
  validateTool(tool) {
    var _a, _b;
    if (!((_a = tool == null ? void 0 : tool.meta) == null ? void 0 : _a.name) || !((_b = tool == null ? void 0 : tool.meta) == null ? void 0 : _b.description)) {
      throw new Error("Tool meta must include name and description");
    }
    if (typeof tool.run !== "function") {
      throw new Error(`Tool ${tool.meta.name} is missing run()`);
    }
  }
};

// chatStore.ts
var CHAT_DIR = "AstraCodex/Chats";
var INDEX_PATH = `${CHAT_DIR}/index.json`;
var ChatStore = class {
  constructor(adapter) {
    this.adapter = adapter;
  }
  createChat(title) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = `chat-${now.replace(/[:.]/g, "-")}`;
    return {
      meta: { id, title, createdAt: now, updatedAt: now },
      settings: {
        baseUrl: "",
        model: "",
        includeActiveNote: false,
        maxContextChars: 0,
        maxMemoryChars: 0
      },
      state: { header: null, state: "idle" },
      messages: []
    };
  }
  async loadIndex() {
    if (!await this.adapter.exists(INDEX_PATH)) {
      return [];
    }
    const raw = await this.adapter.read(INDEX_PATH);
    return JSON.parse(raw);
  }
  async saveIndex(index) {
    await this.adapter.write(INDEX_PATH, JSON.stringify(index, null, 2));
  }
  async saveChat(record) {
    const index = await this.loadIndex();
    const updated = index.filter((entry) => entry.id !== record.meta.id);
    updated.push(record.meta);
    await this.saveIndex(updated);
    await this.adapter.write(this.chatPath(record.meta.id), JSON.stringify(record, null, 2));
  }
  async loadChat(id) {
    const raw = await this.adapter.read(this.chatPath(id));
    return JSON.parse(raw);
  }
  async deleteChat(id) {
    await this.adapter.remove(this.chatPath(id));
    const index = await this.loadIndex();
    await this.saveIndex(index.filter((entry) => entry.id !== id));
  }
  chatPath(id) {
    return `${CHAT_DIR}/${id}.json`;
  }
};

// chatSession.ts
var restoreChatState = (record) => {
  return {
    settings: record.settings,
    state: record.state,
    messages: record.messages
  };
};

// view.ts
var VIEW_TYPE_AGENTIC_CHAT = "agentic-chat-view";
var LOADING_TIMEOUT_MS = 2e4;
var AgenticChatView = class extends import_obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
    this.messages = [];
    this.loading = false;
    this.loadingTimer = null;
    this.settings = defaultSettings();
    this.stateMachine = new StateMachine(["idle", "thinking", "acting"]);
    this.stateMap = {};
    this.parsedHeader = null;
    this.activeChatId = null;
    this.chatIndex = [];
    this.ruleManager = new RuleManager({
      read: (path) => this.app.vault.adapter.read(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files)
    });
    this.chatStore = new ChatStore({
      read: (path) => this.app.vault.adapter.read(path),
      write: (path, content) => this.app.vault.adapter.write(path, content),
      remove: (path) => this.app.vault.adapter.remove(path),
      exists: (path) => this.app.vault.adapter.exists(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files)
    });
    this.toolRegistry = new ToolRegistry({
      read: (path) => this.app.vault.adapter.read(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files)
    });
    this.modelClient = new ModelClient(this.settings);
    this.toolRunner = new ToolRunner(
      {
        read: (path) => this.app.vault.adapter.read(path),
        list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => list.files),
        write: (path, content) => this.app.vault.adapter.write(path, content),
        append: (path, content) => this.app.vault.adapter.append(path, content)
      },
      () => this.stateMachine.canAct(),
      void 0,
      this.toolRegistry,
      (message) => this.renderToolStatus(message)
    );
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
    const chatControls = header.createDiv("agentic-chat-session-controls");
    this.chatSelect = chatControls.createEl("select", { cls: "agentic-chat-session-select" });
    this.chatNewBtn = chatControls.createEl("button", { text: "New" });
    this.chatDeleteBtn = chatControls.createEl("button", { text: "Delete" });
    this.chatExitBtn = chatControls.createEl("button", { text: "Exit" });
    const transcriptWrapper = container.createDiv("agentic-chat-transcript-wrapper");
    this.transcriptEl = transcriptWrapper.createDiv("agentic-chat-transcript");
    const headerRow = container.createDiv("agentic-chat-header-row");
    this.headerEl = headerRow.createDiv("agentic-chat-header-state");
    this.toolStatusEl = headerRow.createDiv("agentic-chat-tool-status");
    const toggleRow = container.createDiv("agentic-chat-toggle-row");
    const toggleLabel = toggleRow.createEl("label");
    this.includeActiveNoteToggle = toggleLabel.createEl("input", { attr: { type: "checkbox" } });
    toggleLabel.appendText(" Include active note context");
    const inputWrapper = container.createDiv("agentic-chat-input-wrapper");
    this.inputEl = inputWrapper.createEl("textarea", { cls: "agentic-chat-input", attr: { rows: "3", placeholder: "Ask or instruct the assistant\u2026" } });
    this.sendBtn = inputWrapper.createEl("button", { cls: "agentic-chat-send-btn", text: "Send" });
    this.statusEl = container.createDiv("agentic-chat-status");
    this.confirmWrapper = container.createDiv("agentic-chat-confirm-wrapper");
    this.confirmBtn = this.confirmWrapper.createEl("button", { cls: "agentic-chat-confirm-btn", text: "Confirm Action" });
    this.confirmWrapper.hide();
    this.editPreviewWrapper = container.createDiv("agentic-chat-edit-preview");
    this.editPreviewWrapper.hide();
    const previewHeader = this.editPreviewWrapper.createDiv({ cls: "agentic-chat-edit-title", text: "Pending Edit Preview" });
    const previewBody = this.editPreviewWrapper.createDiv({ cls: "agentic-chat-edit-body" });
    const previewControls = this.editPreviewWrapper.createDiv({ cls: "agentic-chat-edit-controls" });
    this.editConfirmBtn = previewControls.createEl("button", { cls: "agentic-chat-confirm-btn", text: "Apply Edit" });
    this.editRejectBtn = previewControls.createEl("button", { cls: "agentic-chat-reject-btn", text: "Reject" });
    this.sendBtn.addEventListener("click", () => this.handleSend());
    this.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
        evt.preventDefault();
        this.handleSend();
      }
    });
    this.inputEl.addEventListener("input", () => this.updateControls());
    this.inputEl.addEventListener("keyup", () => this.updateControls());
    this.confirmBtn.addEventListener("click", () => this.handleConfirm());
    this.editConfirmBtn.addEventListener("click", () => this.confirmPendingEdit());
    this.editRejectBtn.addEventListener("click", () => this.rejectPendingEdit());
    this.chatNewBtn.addEventListener("click", () => this.createNewChat());
    this.chatDeleteBtn.addEventListener("click", () => this.deleteCurrentChat());
    this.chatExitBtn.addEventListener("click", () => this.exitChat());
    this.chatSelect.addEventListener("change", () => this.switchChat(this.chatSelect.value));
    this.includeActiveNoteToggle.addEventListener("change", () => {
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
    this.renderHeader();
    this.renderConfirmation();
    this.renderEditPreview();
  }
  renderMessages() {
    this.transcriptEl.empty();
    for (const msg of this.messages) {
      const row = this.transcriptEl.createDiv({ cls: ["agentic-chat-row", `role-${msg.role}`] });
      const bubble = row.createDiv({ cls: "agentic-chat-bubble" });
      const label = msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : "System";
      bubble.createDiv({ cls: "agentic-chat-label", text: label });
      if (msg.role === "assistant" && msg.header) {
        const headerToggle = bubble.createDiv({
          cls: "agentic-chat-header-toggle",
          text: msg.headerExpanded ? "Header \u25BE" : "Header \u25B8"
        });
        headerToggle.addEventListener("click", () => {
          msg.headerExpanded = !msg.headerExpanded;
          this.renderMessages();
        });
        if (msg.headerExpanded) {
          bubble.createDiv({ cls: "agentic-chat-header-text", text: msg.header });
        }
      }
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
  renderToolStatus(message) {
    this.toolStatusEl.setText(message);
  }
  renderHeader() {
    const header = this.parsedHeader;
    const stateText = header ? `State: ${header.state}` : `State: ${this.stateMachine.state}`;
    this.headerEl.setText(stateText);
  }
  renderConfirmation() {
    var _a, _b;
    const needsConfirmation = (_b = (_a = this.parsedHeader) == null ? void 0 : _a.needsConfirmation) != null ? _b : false;
    if (needsConfirmation && !this.stateMachine.canAct()) {
      this.confirmWrapper.show();
      this.confirmBtn.removeAttribute("disabled");
    } else {
      this.confirmWrapper.hide();
    }
  }
  renderEditPreview() {
    const pending = this.toolRunner.getPendingEdit();
    if (!pending) {
      this.editPreviewWrapper.hide();
      return;
    }
    const body = this.editPreviewWrapper.querySelector(".agentic-chat-edit-body");
    if (body) {
      body.setText(`Lines ${pending.preview.startLine}-${pending.preview.endLine}
---
${pending.preview.before}
---
${pending.preview.after}`);
    }
    this.editPreviewWrapper.show();
  }
  pushMessage(role, text, header) {
    this.messages.push({ role, text, header, headerExpanded: false });
    this.renderMessages();
  }
  updateLastAssistantMessage(text) {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === "assistant") {
      last.text = text;
      const headerParts = this.extractHeader(text);
      if (headerParts) {
        last.header = headerParts.header;
        last.text = headerParts.body;
      }
    }
    this.renderMessages();
  }
  async handleSend() {
    if (this.loading) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;
    if (this.toolRunner.getPendingEdit()) {
      this.toolRunner.clearPendingEdit();
      this.renderEditPreview();
    }
    this.pushMessage("user", prompt);
    this.inputEl.value = "";
    this.setLoading(true);
    await this.saveActiveChat();
    try {
      const coreRules = await this.ruleManager.loadCore();
      const memory = await this.ruleManager.loadMemory();
      const activeNote = this.includeActiveNoteToggle.checked ? await this.getActiveNoteContent() : void 0;
      const assembledPrompt = buildPrompt({
        userMessage: prompt,
        settings: this.settings,
        coreRules,
        memory,
        activeNote,
        tools: this.toolRegistry.listTools()
      });
      let assistantText = "";
      this.pushMessage("assistant", "");
      const result = await this.modelClient.generateStream(assembledPrompt, (delta) => {
        assistantText += delta;
        this.updateLastAssistantMessage(assistantText);
      });
      this.parsedHeader = result.header;
      this.applyState(result.header.state || "idle");
      this.stateMachine.setNeedsConfirmation(result.header.needsConfirmation);
      await this.saveActiveChat();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.pushMessage("system", `Error: ${msg}`);
    } finally {
      this.setLoading(false);
      this.refreshUI();
    }
  }
  async getActiveNoteContent() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return void 0;
    return this.app.vault.read(file);
  }
  handleConfirm() {
    this.stateMachine.confirm();
    this.refreshUI();
  }
  async confirmPendingEdit() {
    await this.toolRunner.confirmPendingEdit();
    this.renderEditPreview();
    await this.saveActiveChat();
  }
  rejectPendingEdit() {
    this.toolRunner.clearPendingEdit();
    this.renderEditPreview();
  }
  async loadChatIndex() {
    this.chatIndex = await this.chatStore.loadIndex();
    if (this.chatIndex.length === 0) {
      const record = this.chatStore.createChat("New Chat");
      await this.chatStore.saveChat(record);
      this.chatIndex = [record.meta];
    }
    const active = this.chatIndex[0];
    await this.switchChat(active.id);
  }
  renderChatOptions() {
    this.chatSelect.empty();
    this.chatIndex.forEach((chat) => {
      const option = this.chatSelect.createEl("option", { text: chat.title, value: chat.id });
      if (chat.id === this.activeChatId) {
        option.selected = true;
      }
    });
  }
  async switchChat(chatId) {
    if (!chatId) return;
    const record = await this.chatStore.loadChat(chatId);
    const restored = restoreChatState(record);
    this.activeChatId = record.meta.id;
    this.settings = restored.settings;
    this.parsedHeader = restored.state.header;
    this.stateMachine.setState(restored.state.state || "idle");
    this.messages = restored.messages;
    this.includeActiveNoteToggle.checked = this.settings.includeActiveNote;
    this.renderChatOptions();
    this.refreshUI();
  }
  async createNewChat() {
    const record = this.chatStore.createChat("New Chat");
    await this.chatStore.saveChat(record);
    this.chatIndex = await this.chatStore.loadIndex();
    await this.switchChat(record.meta.id);
  }
  async deleteCurrentChat() {
    if (!this.activeChatId) return;
    await this.chatStore.deleteChat(this.activeChatId);
    this.chatIndex = await this.chatStore.loadIndex();
    if (this.chatIndex.length === 0) {
      await this.createNewChat();
      return;
    }
    await this.switchChat(this.chatIndex[0].id);
  }
  exitChat() {
    this.messages = [];
    this.activeChatId = null;
    this.refreshUI();
  }
  async saveActiveChat() {
    var _a, _b, _c, _d;
    if (!this.activeChatId) return;
    const record = {
      meta: {
        id: this.activeChatId,
        title: (_b = (_a = this.chatIndex.find((chat) => chat.id === this.activeChatId)) == null ? void 0 : _a.title) != null ? _b : "Chat",
        createdAt: (_d = (_c = this.chatIndex.find((chat) => chat.id === this.activeChatId)) == null ? void 0 : _c.createdAt) != null ? _d : (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      settings: this.settings,
      state: { header: this.parsedHeader, state: this.stateMachine.state },
      messages: this.messages
    };
    await this.chatStore.saveChat(record);
    this.chatIndex = await this.chatStore.loadIndex();
    this.renderChatOptions();
  }
  extractHeader(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 3) return null;
    const headerLines = lines.slice(0, 3);
    const isHeader = headerLines.every(
      (line) => line.startsWith("STATE:") || line.startsWith("NEEDS_CONFIRMATION:") || line.startsWith("PROPOSED_ACTION:")
    );
    if (!isHeader) return null;
    const body = lines.slice(3).join("\n").trimStart();
    return { header: headerLines.join("\n"), body };
  }
  updateSettings(settings) {
    this.settings = settings;
    this.modelClient = new ModelClient(this.settings);
    this.includeActiveNoteToggle.checked = this.settings.includeActiveNote;
    this.refreshUI();
  }
  async loadStateConfiguration() {
    const core = await this.ruleManager.loadCore();
    const parsed = this.parseStates(core.states);
    const allowed = parsed.allowedStates.length ? parsed.allowedStates : ["idle", "thinking", "acting"];
    this.stateMap = parsed.stateMap;
    this.stateMachine = new StateMachine(allowed, allowed[0], this.stateMap);
  }
  parseStates(statesText) {
    var _a;
    const allowedStates = [];
    const stateMap = {};
    const mappingMatch = statesText.match(/\[(.+?)\]/s);
    if (mappingMatch) {
      const mappingContent = mappingMatch[1];
      mappingContent.split(",").forEach((pair) => {
        const [key, value] = pair.split(":").map((entry) => entry.trim());
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
    const bulletMatches = (_a = statesText.match(/^-\s+([a-zA-Z_]+)\s+/gm)) != null ? _a : [];
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
  applyState(state) {
    const resolved = this.stateMachine.resolveState(state);
    if (!resolved) {
      this.stateMachine.setState("idle");
      return;
    }
    try {
      this.stateMachine.setState(resolved);
    } catch (error) {
      console.warn("Unknown state from model, falling back to idle", state, error);
      this.stateMachine.setState("idle");
    }
  }
};

// main.ts
var AstraCodexPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = defaultSettings();
  }
  async onload() {
    await this.loadSettings();
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
    this.addSettingTab(new AstraCodexSettingTab(this.app, this));
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
  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = mergeSettings(loaded);
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.broadcastSettings();
  }
  broadcastSettings() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENTIC_CHAT).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof AgenticChatView) {
        view.updateSettings(this.settings);
      }
    });
  }
};
var AstraCodexSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("Ollama Base URL").setDesc("Default: http://127.0.0.1:11434").addText(
      (text) => text.setPlaceholder("http://127.0.0.1:11434").setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
        this.plugin.settings.baseUrl = value.trim() || "http://127.0.0.1:11434";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Model").setDesc("Ollama model name").addText(
      (text) => text.setPlaceholder("qwen2.5:32b-instruct").setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim() || "qwen2.5:32b-instruct";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Max context length").setDesc("Maximum characters of combined prompt context.").addSlider(
      (slider) => slider.setLimits(1e3, 2e4, 500).setValue(this.plugin.settings.maxContextChars).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.maxContextChars = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Max memory length").setDesc("Maximum characters of memory injected into prompt.").addSlider(
      (slider) => slider.setLimits(500, 1e4, 250).setValue(this.plugin.settings.maxMemoryChars).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.maxMemoryChars = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Include active note by default").setDesc("Sets the default toggle state for active note context.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.includeActiveNote).onChange(async (value) => {
        this.plugin.settings.includeActiveNote = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
