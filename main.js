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
  maxContextChars: 32e3,
  // Increased default to support larger context windows (32K models)
  maxMemoryChars: 2e3,
  contextSliderValue: 50
  // Deprecated but kept for backwards compatibility
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
var HEADER_REMINDER = `RESPONSE FORMAT:

If you need to think through your reasoning, wrap it in <think>...</think> tags:
<think>
Your internal reasoning here...
</think>
Your user-facing response here.

Everything OUTSIDE <think> tags is shown directly to the user.
IMPORTANT: Always include BOTH <think> and </think> tags if you use them.

TOOL CALLS:
To use a tool, output a tool_call block:

<tool_call>
{"name": "read", "arguments": {"path": "file.md"}}
</tool_call>

Rules:
- Output AT MOST ONE tool block per response
- Do NOT include tool blocks inside <think> tags
- Tool results will be added to conversation history automatically
- You will be called again after each tool execution to see the result

FILE READING GUIDANCE:
- If the user asks to read a file by name/title, call \`list\` first to find the correct path.
- Only call \`read\` after you have a specific vault path.

Your response should be clean and conversational.
DO NOT output "STATE:" or "NEEDS_CONFIRMATION:" headers - state is tracked internally.
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
  history,
  activeNote,
  selection,
  tools
}) => {
  const contextSections = [];
  const headerSection = HEADER_REMINDER.trim();
  contextSections.push(`Charter:
${coreRules.charter}`);
  contextSections.push(`States:
${coreRules.states}`);
  const voice = voiceOverride != null ? voiceOverride : coreRules.voice;
  if (voice == null ? void 0 : voice.trim()) {
    contextSections.push(`Voice:
${voice}`);
  }
  if (rules && Object.keys(rules).length) {
    const rulesBlock = Object.entries(rules).map(([name, content]) => `Rule: ${name}
${content}`).join("\n\n");
    contextSections.push(`Rules:
${rulesBlock}`);
  }
  if (tools && tools.length > 0) {
    const toolBlock = tools.map((tool) => {
      const params = tool.params ? JSON.stringify(tool.params) : "{}";
      return `${tool.name}: ${tool.description} (params: ${params})`;
    }).join("\n");
    contextSections.push(`Tools:
${toolBlock}`);
  }
  if (typeof history === "string" && history.trim().length > 0) {
    contextSections.push(`Conversation History:
${history.trim()}`);
  }
  if (typeof memory === "string" && memory.trim().length > 0) {
    const trimmedMemory = `Memory: ${memory.trim()}`;
    contextSections.push(clamp(trimmedMemory, settings.maxMemoryChars + 50));
  }
  if (activeNote == null ? void 0 : activeNote.trim()) {
    contextSections.push(`Active Note:
${activeNote}`);
  }
  if (selection == null ? void 0 : selection.trim()) {
    contextSections.push(`Selection:
${selection}`);
  }
  const userRequestSection = `User Request:
${userMessage}`;
  const maxLength = settings.maxContextChars;
  if (maxLength <= 0) return "";
  const contextCombined = [headerSection, ...contextSections].join("\n\n");
  const separator = contextCombined ? "\n\n" : "";
  const full = contextCombined ? `${contextCombined}${separator}${userRequestSection}` : userRequestSection;
  if (full.length <= maxLength) {
    return full;
  }
  const availableForContext = maxLength - (separator.length + userRequestSection.length);
  if (availableForContext > 0) {
    const truncatedContext = clamp(contextCombined, availableForContext);
    return `${truncatedContext}${separator}${userRequestSection}`;
  }
  const headerPlusSeparatorLength = headerSection.length + 2;
  if (maxLength > headerPlusSeparatorLength) {
    const truncatedUser = clamp(userRequestSection, maxLength - headerPlusSeparatorLength);
    return `${headerSection}

${truncatedUser}`;
  }
  return clamp(userRequestSection, maxLength);
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
var STOP_SEQUENCES = [
  "User:",
  "\nUser:",
  "Human:",
  "\nHuman:",
  "Memory:",
  "\nMemory:"
];
var sanitizeResponse = (text) => {
  const markers = [
    /\nUser: /,
    /\nHuman: /,
    /\nMemory: /,
    /\nAssistant: /
    // Model shouldn't label its own continuation
  ];
  let truncateAt = text.length;
  for (const marker of markers) {
    const match = text.match(marker);
    if ((match == null ? void 0 : match.index) !== void 0 && match.index < truncateAt) {
      truncateAt = match.index;
    }
  }
  return text.slice(0, truncateAt);
};
var ModelClient = class {
  constructor(settings, fetchImpl) {
    this.settings = settings;
    const baseFetch = fetchImpl != null ? fetchImpl : globalThis.fetch;
    this.fetchImpl = baseFetch ? baseFetch.bind(globalThis) : fetch;
  }
  async generateStream(prompt, onDelta, opts) {
    const numCtx = Math.min(32768, Math.round(this.settings.maxContextChars * 0.25));
    const url = `${this.settings.baseUrl}/api/generate`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.settings.model,
        prompt,
        stream: true,
        options: {
          num_ctx: numCtx,
          stop: STOP_SEQUENCES
          // Prevent hallucinated conversation continuations
        }
      }),
      signal: opts == null ? void 0 : opts.signal
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
    const sanitizedText = sanitizeResponse(fullText);
    const header = parseHeader(sanitizedText);
    return { header, text: sanitizedText };
  }
};
var parseHeader = (text) => {
  const header = {
    state: "idle",
    needsConfirmation: false
  };
  const lines = text.split(/\r?\n/).slice(0, 40);
  for (const line of lines) {
    if (line.startsWith("STATE:")) {
      header.state = line.replace("STATE:", "").trim() || header.state;
    }
    if (line.startsWith("NEEDS_CONFIRMATION:")) {
      const value = line.replace("NEEDS_CONFIRMATION:", "").trim().toLowerCase();
      header.needsConfirmation = value === "true";
    }
  }
  return header;
};

// toolRunner.ts
var ToolRunner = class {
  constructor(adapter, canActCallback, now = () => (/* @__PURE__ */ new Date()).toISOString(), registry, onToolActivity, getActiveFilePath) {
    this.pendingEdit = null;
    this.adapter = adapter;
    this.canActCallback = canActCallback;
    this.now = now;
    this.registry = registry;
    this.onToolActivity = onToolActivity;
    this.getActiveFilePath = getActiveFilePath;
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
  canAct() {
    return this.canActCallback();
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
      log: (message) => console.log(`[Tool:${name}] ${message}`),
      activeFilePath: this.getActiveFilePath ? this.getActiveFilePath() : null
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
    if (!this.canActCallback()) {
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
  createChat(title, settings) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = `chat-${now.replace(/[:.]/g, "-")}`;
    return {
      meta: { id, title, createdAt: now, updatedAt: now },
      settings,
      state: { header: null, state: "idle" },
      messages: [],
      lastDocument: null
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
var mergeChatSettings = (globalSettings, chatSettings) => {
  const defaults = mergeSettings();
  const merged = mergeSettings(chatSettings);
  return {
    ...merged,
    // enforce global model/baseUrl/maxContextChars - user's current settings always win
    baseUrl: globalSettings.baseUrl,
    model: globalSettings.model,
    maxContextChars: globalSettings.maxContextChars || defaults.maxContextChars,
    // treat 0 as missing for maxMemoryChars
    maxMemoryChars: merged.maxMemoryChars > 0 ? merged.maxMemoryChars : globalSettings.maxMemoryChars || defaults.maxMemoryChars,
    // allow includeActiveNote to follow global unless explicitly set in chat
    includeActiveNote: typeof (chatSettings == null ? void 0 : chatSettings.includeActiveNote) === "boolean" ? chatSettings.includeActiveNote : globalSettings.includeActiveNote,
    // contextSliderValue is deprecated but kept for backwards compatibility
    contextSliderValue: defaults.contextSliderValue
  };
};
var restoreChatState = (record) => {
  var _a, _b;
  const defaults = mergeSettings();
  const merged = mergeSettings(record.settings);
  const settings = {
    ...merged,
    baseUrl: merged.baseUrl && merged.baseUrl.trim() ? merged.baseUrl : defaults.baseUrl,
    model: merged.model && merged.model.trim() ? merged.model : defaults.model,
    maxContextChars: merged.maxContextChars > 0 ? merged.maxContextChars : defaults.maxContextChars,
    maxMemoryChars: merged.maxMemoryChars > 0 ? merged.maxMemoryChars : defaults.maxMemoryChars,
    // contextSliderValue is deprecated, just use default
    contextSliderValue: defaults.contextSliderValue,
    includeActiveNote: typeof ((_a = record.settings) == null ? void 0 : _a.includeActiveNote) === "boolean" ? record.settings.includeActiveNote : defaults.includeActiveNote
  };
  return {
    settings,
    state: record.state,
    messages: record.messages,
    lastDocument: (_b = record.lastDocument) != null ? _b : null
  };
};

// chatTitle.ts
var deriveChatTitle = (firstUserMessage, maxLen = 40) => {
  const normalized = firstUserMessage.replace(/\s+/g, " ").trim();
  if (!normalized) return "Chat";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}\u2026`;
};

// toolOrchestrator.ts
var isExtractionError = (result) => {
  return result !== null && "error" in result;
};
var parseToolJson = (rawJson) => {
  var _a;
  try {
    const parsed = JSON.parse(rawJson);
    if (!(parsed == null ? void 0 : parsed.name) || typeof parsed.name !== "string") return null;
    const argsSource = (_a = parsed.arguments) != null ? _a : parsed.args;
    const args = argsSource && typeof argsSource === "object" ? argsSource : {};
    return {
      toolCall: {
        name: parsed.name,
        arguments: args
      },
      rawBlock: rawJson
    };
  } catch (e) {
    return null;
  }
};
var extractFencedToolCall = (text) => {
  const allBlocks = [];
  const xmlMatches = text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi);
  for (const match of xmlMatches) {
    const content = match[1].trim();
    const jsonMatch = content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      allBlocks.push({ rawBlock: match[0], json: jsonMatch[1].trim() });
    }
  }
  const unclosedMatches = text.matchAll(/<tool_call>\s*(\{[\s\S]*?\})(?=\s*$|\s*<|\n\n)/gi);
  for (const match of unclosedMatches) {
    const json = match[1].trim();
    if (!allBlocks.some((b) => b.json === json)) {
      allBlocks.push({ rawBlock: match[0], json });
    }
  }
  if (allBlocks.length === 0) {
    return null;
  }
  const lastBlock = allBlocks[allBlocks.length - 1];
  const result = parseToolJson(lastBlock.json);
  if (result) {
    result.rawBlock = lastBlock.rawBlock;
    return result;
  }
  return null;
};
var formatToolActivity = (call) => {
  var _a;
  const n = call.name;
  const args = (_a = call.arguments) != null ? _a : {};
  if (n === "active_file") return "reading: [current file]";
  if (n === "list") {
    const prefix = typeof args.prefix === "string" ? args.prefix : "";
    return `listing: ${prefix || "[all files]"}`;
  }
  if (n === "read") {
    const path = typeof args.path === "string" ? args.path : "[file]";
    return `reading: ${path}`;
  }
  if (n === "write" || n === "append" || n === "line_edit") {
    return `editing: ${typeof args.path === "string" ? args.path : "[file]"}`;
  }
  return `tool: ${n}`;
};
var stripToolBlocks = (text) => {
  let result = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  result = result.replace(/<tool_call>\s*\{[\s\S]*?\}(?=\s*$|\s*<|\n\n)/gi, "");
  result = result.replace(/<\/?tool_call>/gi, "");
  const normalized = result.replace(/\n{3,}/g, "\n\n");
  return normalized.trim();
};
var executeToolCall = async (runner, call) => {
  var _a;
  const result = await runner.executeTool(call.name, (_a = call.arguments) != null ? _a : {});
  return {
    name: call.name,
    result
  };
};

// agentLoop.ts
var runAgentLoop = async ({
  history,
  buildPrompt: buildPrompt2,
  model,
  toolRunner,
  maxTurns = 8,
  callbacks,
  signal
}) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  let lastResponse = null;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal == null ? void 0 : signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    (_a = callbacks == null ? void 0 : callbacks.onTurnStart) == null ? void 0 : _a.call(callbacks, { turn, history });
    const prompt = buildPrompt2(history);
    (_b = callbacks == null ? void 0 : callbacks.onAssistantStart) == null ? void 0 : _b.call(callbacks);
    let streamed = "";
    const response = await model.generateStream(
      prompt,
      (delta) => {
        var _a2;
        streamed += delta;
        (_a2 = callbacks == null ? void 0 : callbacks.onAssistantDelta) == null ? void 0 : _a2.call(callbacks, delta, streamed);
      },
      { signal }
    );
    lastResponse = response;
    (_c = callbacks == null ? void 0 : callbacks.onHeader) == null ? void 0 : _c.call(callbacks, response.header);
    const extracted = extractFencedToolCall(response.text);
    const assistantMessage = {
      role: "assistant",
      text: response.text,
      rawText: response.text,
      header: response.header ? `STATE: ${response.header.state}` : void 0
    };
    if (extracted && !isExtractionError(extracted)) {
      const toolCallInfo = {
        name: extracted.toolCall.name,
        arguments: (_d = extracted.toolCall.arguments) != null ? _d : {}
      };
      assistantMessage.toolCalls = [toolCallInfo];
    }
    history.push(assistantMessage);
    (_e = callbacks == null ? void 0 : callbacks.onMessageAdded) == null ? void 0 : _e.call(callbacks, assistantMessage);
    if (!extracted) break;
    if (isExtractionError(extracted)) {
      (_f = callbacks == null ? void 0 : callbacks.onToolError) == null ? void 0 : _f.call(callbacks, { error: extracted.error });
      const errorMessage = {
        role: "user",
        text: `ERROR: ${extracted.error}

Please try again with exactly ONE tool block.`
      };
      history.push(errorMessage);
      (_g = callbacks == null ? void 0 : callbacks.onMessageAdded) == null ? void 0 : _g.call(callbacks, errorMessage);
      continue;
    }
    if (signal == null ? void 0 : signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const executed = await executeToolCall(toolRunner, extracted.toolCall);
    (_h = callbacks == null ? void 0 : callbacks.onToolResult) == null ? void 0 : _h.call(callbacks, { name: executed.name, result: executed.result });
    const toolResultMessage = {
      role: "tool",
      text: typeof executed.result === "string" ? executed.result : JSON.stringify(executed.result, null, 2),
      toolResult: executed.result,
      toolCallId: `${turn}-${executed.name}`
    };
    history.push(toolResultMessage);
    (_i = callbacks == null ? void 0 : callbacks.onMessageAdded) == null ? void 0 : _i.call(callbacks, toolResultMessage);
  }
  if (!lastResponse) {
    throw new Error("Agent loop did not produce a model response");
  }
  return lastResponse;
};

// conversationHistory.ts
var stripThinkBlocks = (text) => {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
};
var stripLeakedHeaders = (text) => {
  return text.replace(/^STATE:\s*\S+\s*/gim, "").replace(/^NEEDS_CONFIRMATION:\s*\S+\s*/gim, "").replace(/^FINAL:\s*/gim, "").replace(/^TOOL CALLS:\s*/gim, "").replace(/\n{3,}/g, "\n\n").trim();
};
var buildConversationHistory = (messages, maxChars, opts) => {
  var _a, _b, _c, _d, _e, _f;
  if (maxChars <= 0) return "[]";
  const excludeLatestUserMessage = (_a = opts == null ? void 0 : opts.excludeLatestUserMessage) != null ? _a : false;
  const entries = [];
  let startIndex = messages.length - 1;
  if (excludeLatestUserMessage && ((_b = messages[startIndex]) == null ? void 0 : _b.role) === "user") {
    startIndex -= 1;
  }
  const tempEntries = [];
  let used = 0;
  for (let i = startIndex; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    let entry;
    if (msg.role === "user") {
      const content = ((_c = msg.text) == null ? void 0 : _c.trim()) || "";
      if (!content) continue;
      entry = { role: "user", content };
    } else if (msg.role === "assistant") {
      const base = stripToolBlocks((_d = msg.text) != null ? _d : "").trim();
      const content = stripLeakedHeaders(stripThinkBlocks(base));
      entry = { role: "assistant", content: content || "[action]" };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        entry.tool_calls = msg.toolCalls.map((tc) => ({
          name: tc.name,
          arguments: tc.arguments
        }));
      }
    } else if (msg.role === "tool") {
      const content = ((_e = msg.text) == null ? void 0 : _e.trim()) || JSON.stringify((_f = msg.toolResult) != null ? _f : "");
      entry = {
        role: "tool",
        content,
        tool_call_id: msg.toolCallId
      };
    } else {
      continue;
    }
    const entryJson = JSON.stringify(entry);
    const addition = entryJson.length + 2;
    if (used + addition > maxChars) {
      break;
    }
    tempEntries.push(entry);
    used += addition;
  }
  return JSON.stringify(tempEntries.reverse(), null, 2);
};

// textParser.ts
var extractThink = (text) => {
  var _a;
  const match = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) return { think: null, rest: text };
  const think = match[1].trim();
  const rest = (text.slice(0, match.index) + text.slice(((_a = match.index) != null ? _a : 0) + match[0].length)).trim();
  return { think: think || null, rest };
};
var extractHeaderAndBody = (text) => {
  const lines = text.split(/\r?\n/);
  let stateLine = null;
  let needsLine = null;
  const scanLimit = Math.min(lines.length, 60);
  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i].trim();
    if (!stateLine && line.startsWith("STATE:")) stateLine = line;
    if (!needsLine && line.startsWith("NEEDS_CONFIRMATION:")) needsLine = line;
    if (stateLine && needsLine) break;
  }
  const headerLines = [stateLine, needsLine].filter(Boolean);
  const header = headerLines.length ? headerLines.join("\n") : null;
  let body = text;
  body = body.replace(/^STATE:\s*[a-zA-Z_]+\s*\n?/gim, "");
  body = body.replace(/^NEEDS_CONFIRMATION:\s*(true|false)\s*\n?/gim, "");
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  return { header, body };
};
var extractFinal = (text) => {
  const match = text.match(/(^|\n)\s*FINAL:\s*/);
  if (!match || match.index === void 0) return { final: null, body: text };
  const start = match.index + match[0].length;
  const final = text.slice(start).trim();
  const body = text.slice(0, match.index).trim();
  return { final: final || null, body };
};
var extractLastReadPath = (text) => {
  var _a;
  const match = text.match(/```tool\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const path = (_a = parsed == null ? void 0 : parsed.args) == null ? void 0 : _a.path;
    return typeof path === "string" ? path : null;
  } catch (e) {
    return null;
  }
};

// view.ts
var VIEW_TYPE_AGENTIC_CHAT = "agentic-chat-view";
var LOADING_TIMEOUT_MS = 2e4;
var AgenticChatView = class extends import_obsidian.ItemView {
  constructor(leaf, initialSettings) {
    super(leaf);
    this.messages = [];
    this.loadedRules = {};
    this.activityLine = null;
    this.loading = false;
    this.loadingTimer = null;
    this.abortController = null;
    this.settings = defaultSettings();
    this.stateMachine = new StateMachine(["idle", "thinking", "acting"]);
    this.stateMap = {};
    this.parsedHeader = null;
    this.activeChatId = null;
    this.chatIndex = [];
    this.hasNamedActiveChat = false;
    this.ruleManager = new RuleManager({
      read: (path) => this.app.vault.adapter.read(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
        ...list.files,
        ...list.folders.map((f) => f.endsWith("/") ? f : f + "/")
      ])
    });
    this.chatStore = new ChatStore({
      read: (path) => this.app.vault.adapter.read(path),
      write: (path, content) => this.app.vault.adapter.write(path, content),
      remove: (path) => this.app.vault.adapter.remove(path),
      exists: (path) => this.app.vault.adapter.exists(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
        ...list.files,
        ...list.folders.map((f) => f.endsWith("/") ? f : f + "/")
      ])
    });
    this.toolRegistry = new ToolRegistry({
      read: (path) => this.app.vault.adapter.read(path),
      list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
        ...list.files,
        ...list.folders.map((f) => f.endsWith("/") ? f : f + "/")
      ])
    });
    this.modelClient = new ModelClient(this.settings);
    this.toolRunner = new ToolRunner(
      {
        read: (path) => this.app.vault.adapter.read(path),
        list: (prefix) => this.app.vault.adapter.list(prefix).then((list) => [
          ...list.files,
          ...list.folders.map((f) => f.endsWith("/") ? f : f + "/")
        ]),
        write: (path, content) => this.app.vault.adapter.write(path, content),
        append: (path, content) => this.app.vault.adapter.append(path, content)
      },
      () => this.stateMachine.canAct(),
      void 0,
      this.toolRegistry,
      (message) => this.renderToolStatus(message),
      () => {
        var _a, _b;
        return (_b = (_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path) != null ? _b : null;
      }
    );
    if (initialSettings) {
      this.settings = initialSettings;
      this.modelClient = new ModelClient(this.settings);
    }
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
      if (evt.key === "Enter" && !evt.shiftKey) {
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
      if (msg.role === "assistant" && msg.think) {
        const thinkToggle = bubble.createDiv({
          cls: "agentic-chat-header-toggle",
          text: msg.thinkExpanded ? "Think \u25BE" : "Think \u25B8"
        });
        thinkToggle.addEventListener("click", () => {
          msg.thinkExpanded = !msg.thinkExpanded;
          this.renderMessages();
        });
        if (msg.thinkExpanded) {
          bubble.createDiv({ cls: "agentic-chat-header-text", text: msg.think });
        }
      }
      const displayText = msg.text && msg.text.trim().length > 0 ? msg.text : msg.role === "assistant" && msg.think ? "(No final answer was produced \u2014 expand Think)" : msg.text;
      if (msg.role === "assistant" && msg.activityLine) {
        bubble.createDiv({ cls: "agentic-chat-tool-activity", text: msg.activityLine });
      }
      bubble.createDiv({ cls: "agentic-chat-text", text: displayText });
    }
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }
  updateControls() {
    const trimmed = this.inputEl.value.trim();
    this.sendBtn.toggleClass("is-loading", this.loading);
    this.sendBtn.setText(this.loading ? "Cancel" : "Send");
    if (this.loading || trimmed.length === 0) {
      if (this.loading) {
        this.sendBtn.removeAttribute("disabled");
        this.statusEl.setText("Sending...");
      } else {
        this.sendBtn.setAttr("disabled", "true");
        this.statusEl.setText("Disabled: enter text");
      }
    } else {
      this.sendBtn.removeAttribute("disabled");
      this.statusEl.setText("Ready");
    }
  }
  cancelInFlight() {
    if (!this.abortController) return;
    try {
      this.abortController.abort();
    } catch (e) {
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
      last.rawText = text;
      const extracted = extractFencedToolCall(text);
      this.activityLine = extracted && !isExtractionError(extracted) ? formatToolActivity(extracted.toolCall) : null;
      last.activityLine = this.activityLine;
      const withoutToolBlocks = stripToolBlocks(text);
      const { think, rest } = extractThink(withoutToolBlocks);
      if (think) {
        last.think = think;
        if (typeof last.thinkExpanded !== "boolean") last.thinkExpanded = false;
      }
      const { header, body } = extractHeaderAndBody(rest);
      const { final } = extractFinal(body);
      if (header) {
        last.header = header;
        const chosen = final != null ? final : body;
        last.text = chosen;
      } else if (this.parsedHeader) {
        last.header = `STATE: ${this.parsedHeader.state}
NEEDS_CONFIRMATION: ${this.parsedHeader.needsConfirmation}`;
        const { final: finalFromRest } = extractFinal(rest);
        const chosen = finalFromRest != null ? finalFromRest : rest;
        last.text = chosen;
      } else {
        const { final: finalFromRest } = extractFinal(rest);
        const chosen = finalFromRest != null ? finalFromRest : rest;
        last.text = chosen;
      }
    }
    this.renderMessages();
  }
  async handleSend() {
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
    this.pushMessage("user", prompt);
    await this.ensureChatNamed(prompt);
    this.inputEl.value = "";
    this.setLoading(true);
    this.abortController = new AbortController();
    await this.saveActiveChat();
    try {
      await this.toolRegistry.loadTools();
      const coreRules = await this.ruleManager.loadCore();
      const memory = await this.ruleManager.loadMemory();
      await this.ensureBaseRulesLoaded();
      const activeNote = this.settings.includeActiveNote ? await this.getActiveNoteContent() : void 0;
      const buildChatPrompt = (history) => {
        var _a;
        const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
        const userMessage = (_a = lastUserMsg == null ? void 0 : lastUserMsg.text) != null ? _a : "";
        const fixed = buildPrompt({
          userMessage,
          settings: this.settings,
          coreRules,
          rules: this.loadedRules,
          memory,
          history: "",
          activeNote,
          tools: this.toolRegistry.listTools()
        });
        const historyBudget = Math.max(0, this.settings.maxContextChars - fixed.length);
        const historyJson = buildConversationHistory(history, historyBudget, { excludeLatestUserMessage: true });
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
      let assistantText = "";
      const result = await runAgentLoop({
        history: this.messages,
        buildPrompt: buildChatPrompt,
        model: this.modelClient,
        toolRunner: this.toolRunner,
        signal: this.abortController.signal,
        callbacks: {
          onTurnStart: ({ turn, history }) => {
            this.messages = history;
          },
          onAssistantStart: () => {
            assistantText = "";
          },
          onAssistantDelta: (delta) => {
            assistantText += delta;
            this.updateLastAssistantMessage(assistantText);
          },
          onToolResult: ({ name, result: result2 }) => {
            var _a, _b;
            if (name === "read") {
              const readPath = extractLastReadPath(assistantText);
              if ((readPath == null ? void 0 : readPath.startsWith("AstraCodex/Rules/")) && typeof result2 === "string") {
                const ruleName = (_b = (_a = readPath.split("/").pop()) == null ? void 0 : _a.replace(/\.md$/, "")) != null ? _b : readPath;
                this.loadedRules[ruleName] = result2;
              }
            }
            const { header } = extractHeaderAndBody(assistantText);
            if (header) {
              const stateMatch = header.match(/STATE:\s*([a-zA-Z_]+)/);
              const needsConfirmMatch = header.match(/NEEDS_CONFIRMATION:\s*(true|false)/);
              if (stateMatch) {
                const newState = stateMatch[1];
                this.applyState(newState);
              }
              if (needsConfirmMatch) {
                this.stateMachine.setNeedsConfirmation(needsConfirmMatch[1] === "true");
              }
            }
          },
          onMessageAdded: (message) => {
            this.renderMessages();
          }
        }
      });
      this.parsedHeader = result.header;
      this.applyState(result.header.state || "idle");
      this.stateMachine.setNeedsConfirmation(result.header.needsConfirmation);
      await this.saveActiveChat();
    } catch (err) {
      if (err && typeof err === "object" && err.name === "AbortError") {
        this.pushMessage("system", "Cancelled.");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.pushMessage("system", `Error: ${msg}`);
    } finally {
      this.setLoading(false);
      this.refreshUI();
    }
  }
  async ensureBaseRulesLoaded() {
    if (this.loadedRules.tool_protocol) return;
    const base = await this.ruleManager.loadRules([
      "tool_protocol",
      "file_inspection",
      "rules_index",
      "consent_and_modes",
      "memory_policy",
      "uncertainty"
    ]);
    this.loadedRules = { ...this.loadedRules, ...base };
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
      const record = this.chatStore.createChat("New Chat", this.settings);
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
    var _a;
    if (!chatId) return;
    const record = await this.chatStore.loadChat(chatId);
    const restored = restoreChatState(record);
    this.activeChatId = record.meta.id;
    this.settings = mergeChatSettings(this.settings, restored.settings);
    this.parsedHeader = restored.state.header;
    this.stateMachine.setState(restored.state.state || "idle");
    this.messages = restored.messages;
    this.hasNamedActiveChat = ((_a = record.meta.title) != null ? _a : "").trim() !== "" && record.meta.title !== "New Chat";
    this.loadedRules = {};
    this.renderChatOptions();
    this.refreshUI();
  }
  async createNewChat() {
    const record = this.chatStore.createChat("New Chat", this.settings);
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
  // Legacy fixed-line header extractor removed; we now parse keys directly.
  updateSettings(settings) {
    this.settings = mergeChatSettings(settings, this.settings);
    this.modelClient = new ModelClient(this.settings);
    this.refreshUI();
  }
  async ensureChatNamed(firstUserMessage) {
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
    meta.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.chatStore.saveIndex(this.chatIndex);
    this.hasNamedActiveChat = true;
    this.renderChatOptions();
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
      (leaf) => new AgenticChatView(leaf, this.settings)
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
      const rightLeaf = workspace.getRightLeaf(false);
      if (!rightLeaf) return;
      leaf = rightLeaf;
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
      (slider) => slider.setLimits(1e3, 12e4, 500).setValue(this.plugin.settings.maxContextChars).setDynamicTooltip().onChange(async (value) => {
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
