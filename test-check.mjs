// tests/e2e/file-listing.e2e.ts
import { describe, it, expect } from "vitest";

// tests/e2e/helpers.ts
import { readFileSync, existsSync, mkdirSync } from "fs";
import { vi } from "vitest";

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
    if (match?.index !== void 0 && match.index < truncateAt) {
      truncateAt = match.index;
    }
  }
  return text.slice(0, truncateAt);
};
var ModelClient = class {
  constructor(settings, fetchImpl) {
    this.settings = settings;
    const baseFetch = fetchImpl ?? globalThis.fetch;
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
      signal: opts?.signal
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

CRITICAL FILE READING RULES:
1. NEVER re-read a file that was already read - check Conversation History for [FILE: path] entries
2. If user gives an ambiguous filename (no path), call \`list\` first to find the full path
3. Only call \`read\` after you have a specific vault path from list results

MULTI-STEP TASKS:
- For read-only operations: complete all reads, then respond
- For write operations: ALWAYS ask for confirmation before writing/appending
- Show the user what you plan to write and ask: "Shall I proceed with this change?"
- Only execute write/append after user confirms

WRITE SAFETY:
- NEVER write or append without explicit user confirmation
- After reading a file, describe your planned changes and wait for approval
- Use \`append\` for adding content to existing files
- Use \`write\` for creating new files or replacing entire content

ERROR HANDLING:
- If a tool returns "ERROR:", acknowledge the error and try alternatives
- If asked to fallback to another file, do so automatically

Your response should be clean and conversational.
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
  const voice = voiceOverride ?? coreRules.voice;
  if (voice?.trim()) {
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
  if (activeNote?.trim()) {
    contextSections.push(`Active Note:
${activeNote}`);
  }
  if (selection?.trim()) {
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

// toolOrchestrator.ts
var isExtractionError = (result) => {
  return result !== null && "error" in result;
};
var parseToolJson = (rawJson) => {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed?.name || typeof parsed.name !== "string") return null;
    const argsSource = parsed.arguments ?? parsed.args;
    const args = argsSource && typeof argsSource === "object" ? argsSource : {};
    return {
      toolCall: {
        name: parsed.name,
        arguments: args
      },
      rawBlock: rawJson
    };
  } catch {
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
var stripToolBlocks = (text) => {
  let result = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  result = result.replace(/<tool_call>\s*\{[\s\S]*?\}(?=\s*$|\s*<|\n\n)/gi, "");
  result = result.replace(/<\/?tool_call>/gi, "");
  const normalized = result.replace(/\n{3,}/g, "\n\n");
  return normalized.trim();
};
var executeToolCall = async (runner, call) => {
  const result = await runner.executeTool(call.name, call.arguments ?? {});
  return {
    name: call.name,
    result
  };
};

// conversationHistory.ts
var stripThinkBlocks = (text) => {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
};
var stripLeakedHeaders = (text) => {
  return text.replace(/^STATE:\s*\S+\s*/gim, "").replace(/^NEEDS_CONFIRMATION:\s*\S+\s*/gim, "").replace(/^FINAL:\s*/gim, "").replace(/^TOOL CALLS:\s*/gim, "").replace(/\n{3,}/g, "\n\n").trim();
};
var buildConversationHistory = (messages, maxChars, opts) => {
  if (maxChars <= 0) return "[]";
  const excludeLatestUserMessage = opts?.excludeLatestUserMessage ?? false;
  let startIndex = messages.length - 1;
  if (excludeLatestUserMessage && messages[startIndex]?.role === "user") {
    startIndex -= 1;
  }
  const tempEntries = [];
  let used = 0;
  for (let i = startIndex; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    let entry;
    if (msg.role === "user") {
      const content = msg.content?.trim() || "";
      if (!content) continue;
      entry = { role: "user", content };
    } else if (msg.role === "assistant") {
      const base = stripToolBlocks(msg.content ?? "").trim();
      const content = stripLeakedHeaders(stripThinkBlocks(base));
      entry = { role: "assistant", content: content || "[action]" };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        entry.tool_calls = msg.tool_calls.map((tc) => ({
          name: tc.name,
          arguments: tc.arguments
        }));
      }
    } else if (msg.role === "tool") {
      const rawContent = msg.content?.trim() || JSON.stringify(msg.tool_result ?? "");
      const toolCallId = msg.tool_call_id ?? "";
      const toolName = toolCallId.split("-").pop() ?? "tool";
      let filePath = "";
      if (toolName === "read" && i > 0) {
        const prevMsg = messages[i - 1];
        if (prevMsg?.role === "assistant" && prevMsg.tool_calls?.length) {
          const readCall = prevMsg.tool_calls.find((tc) => tc.name === "read");
          if (readCall?.arguments?.path) {
            filePath = String(readCall.arguments.path);
          }
        }
      }
      const label = filePath ? `[FILE: ${filePath}]` : `[TOOL RESULT: ${toolName}]`;
      const content = `${label}
${rawContent}`;
      entry = {
        role: "tool",
        content,
        tool_call_id: msg.tool_call_id
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

// tests/e2e/helpers.ts
var loadTestSettings = () => {
  try {
    const data = JSON.parse(readFileSync("data.json", "utf-8"));
    return { ...DEFAULT_SETTINGS, ...data };
  } catch {
    return DEFAULT_SETTINGS;
  }
};
var createMockVault = (files = {}) => {
  const calls = {
    read: [],
    list: [],
    write: [],
    append: []
  };
  return {
    calls,
    files,
    read: vi.fn(async (path) => {
      calls.read.push({ path });
      const content = files[path];
      if (content === void 0) {
        return `ERROR: File not found: ${path}`;
      }
      return content;
    }),
    list: vi.fn(async (prefix) => {
      calls.list.push({ prefix });
      return Object.keys(files).filter((f) => f.startsWith(prefix || ""));
    }),
    write: vi.fn(async (path, content) => {
      calls.write.push({ path, content });
      files[path] = content;
    }),
    append: vi.fn(async (path, content) => {
      calls.append.push({ path, content });
      files[path] = (files[path] ?? "") + content;
    })
  };
};
var createMockToolRunner = (vault) => {
  return {
    executeTool: async (name, args) => {
      switch (name) {
        case "read":
          return vault.read(args.path);
        case "list":
          return vault.list(args.prefix ?? "");
        case "write":
          await vault.write(args.path, args.content);
          return { success: true };
        case "append":
          await vault.append(args.path, args.content);
          return { success: true };
        case "active_file":
          return { path: "test-active-file.md", content: "# Active File" };
        case "line_edit":
          return { success: true };
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    }
  };
};
var buildTestPrompt = (history, settings) => {
  const lastUserMessage = [...history].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    throw new Error("No user message in history");
  }
  return buildPrompt({
    userMessage: lastUserMessage.content ?? "",
    settings,
    coreRules: {
      charter: "You are Astra, a helpful AI assistant.",
      states: "STATE: idle - Ready to assist",
      voice: "Friendly and concise"
    },
    history: buildConversationHistory(history, settings.maxContextChars, { excludeLatestUserMessage: true }),
    tools: [
      { name: "read", description: "Read a file", params: { path: "string" } },
      { name: "list", description: "List files", params: { prefix: "string" } },
      { name: "write", description: "Write a file", params: { path: "string", content: "string" } },
      { name: "append", description: "Append to a file", params: { path: "string", content: "string" } }
    ]
  });
};
var currentTestName = "unknown";
var setCurrentTestName = (name) => {
  currentTestName = name.replace(/[^a-zA-Z0-9-_]/g, "_");
};
var createDebugCallbacks = (log) => {
  let currentTurn = -1;
  return {
    onTurnStart: ({ turn }) => {
      currentTurn = turn;
      log.turns[turn] = {
        turn,
        modelResponse: "",
        toolCalls: [],
        toolResults: []
      };
    },
    onAssistantDelta: (delta, fullText) => {
      if (log.turns[currentTurn]) {
        log.turns[currentTurn].modelResponse = fullText;
      }
    },
    onToolResult: ({ name, result }) => {
      if (log.turns[currentTurn]) {
        log.turns[currentTurn].toolResults.push({ name, result });
      }
    }
  };
};
var writeDebugLog = (log, vaultCalls, testName) => {
  if (testName) {
    setCurrentTestName(testName);
  }
  console.log("\n========== E2E TEST DEBUG LOG ==========");
  console.log(`Test: ${currentTestName}`);
  console.log(`Time: ${(/* @__PURE__ */ new Date()).toISOString()}`);
  console.log("");
  for (const turn of log.turns) {
    console.log(`--- Turn ${turn.turn} ---`);
    console.log("");
    console.log("MODEL RESPONSE:");
    console.log(turn.modelResponse);
    console.log("");
    if (turn.toolResults.length > 0) {
      console.log("TOOL RESULTS:");
      for (const tr of turn.toolResults) {
        console.log(`  [${tr.name}]: ${typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result, null, 2)}`);
      }
      console.log("");
    }
  }
  console.log("========== VAULT CALLS ==========");
  console.log(JSON.stringify(vaultCalls, null, 2));
  console.log("");
  console.log("================================\n");
  return null;
};
var printDebugLog = (log) => {
  console.log("\n========== DEBUG LOG ==========");
  for (const turn of log.turns) {
    console.log(`
--- Turn ${turn.turn} ---`);
    console.log("MODEL RESPONSE:");
    console.log(turn.modelResponse);
    if (turn.toolResults.length > 0) {
      console.log("TOOL RESULTS:");
      for (const tr of turn.toolResults) {
        const resultStr = typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result, null, 2);
        console.log(`  [${tr.name}]: ${resultStr}`);
      }
    }
  }
  console.log("\n================================");
};
var createTestContext = (files = {}) => {
  const settings = loadTestSettings();
  const model = new ModelClient(settings);
  const vault = createMockVault(files);
  const toolRunner = createMockToolRunner(vault);
  const debugLog = { turns: [] };
  const debugCallbacks = createDebugCallbacks(debugLog);
  return {
    settings,
    model,
    vault,
    toolRunner,
    debugLog,
    debugCallbacks,
    printDebug: () => printDebugLog(debugLog),
    buildPrompt: (history) => buildTestPrompt(history, settings)
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
  let lastResponse = null;
  const filesReadThisSession = /* @__PURE__ */ new Set();
  for (const msg of history) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.name === "read" && tc.arguments?.path) {
          filesReadThisSession.add(String(tc.arguments.path));
        }
      }
    }
  }
  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    callbacks?.onTurnStart?.({ turn, history });
    const prompt = buildPrompt2(history);
    const assistantMessage = {
      role: "assistant",
      content: ""
    };
    history.push(assistantMessage);
    callbacks?.onMessageAdded?.(assistantMessage);
    callbacks?.onAssistantStart?.();
    let streamed = "";
    const response = await model.generateStream(
      prompt,
      (delta) => {
        streamed += delta;
        assistantMessage.content = streamed;
        callbacks?.onAssistantDelta?.(delta, streamed);
      },
      { signal }
    );
    lastResponse = response;
    callbacks?.onHeader?.(response.header);
    assistantMessage.content = response.text;
    const extracted = extractFencedToolCall(response.text);
    if (extracted && !isExtractionError(extracted)) {
      const toolCallInfo = {
        name: extracted.toolCall.name,
        arguments: extracted.toolCall.arguments ?? {}
      };
      assistantMessage.tool_calls = [toolCallInfo];
    }
    if (!extracted) break;
    if (isExtractionError(extracted)) {
      callbacks?.onToolError?.({ error: extracted.error });
      const errorMessage = {
        role: "user",
        content: `ERROR: ${extracted.error}

Please try again with exactly ONE tool block.`
      };
      history.push(errorMessage);
      callbacks?.onMessageAdded?.(errorMessage);
      continue;
    }
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const toolCall = extracted.toolCall;
    if (toolCall.name === "read" && toolCall.arguments?.path) {
      const filePath = String(toolCall.arguments.path);
      if (filesReadThisSession.has(filePath)) {
        const hintMessage = {
          role: "user",
          content: `NOTE: File "${filePath}" was already read earlier in this conversation. The content is in the history above. Please use that content instead of re-reading.`
        };
        history.push(hintMessage);
        callbacks?.onMessageAdded?.(hintMessage);
        continue;
      }
      filesReadThisSession.add(filePath);
    }
    const executed = await executeToolCall(toolRunner, toolCall);
    callbacks?.onToolResult?.({ name: executed.name, result: executed.result });
    const toolResultMessage = {
      role: "tool",
      content: typeof executed.result === "string" ? executed.result : JSON.stringify(executed.result, null, 2),
      tool_result: executed.result,
      tool_call_id: `${turn}-${executed.name}`
    };
    history.push(toolResultMessage);
    callbacks?.onMessageAdded?.(toolResultMessage);
  }
  if (!lastResponse) {
    throw new Error("Agent loop did not produce a model response");
  }
  return lastResponse;
};

// tests/e2e/file-listing.e2e.ts
describe("E2E: File Listing", () => {
  it("should list files when asked", async () => {
    const ctx = createTestContext({
      "notes/daily.md": "# Daily",
      "notes/weekly.md": "# Weekly",
      "notes/ideas.md": "# Ideas",
      "archive/old.md": "# Old"
    });
    const history = [
      { role: "user", content: "What files are in the notes folder?" }
    ];
    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });
    writeDebugLog(ctx.debugLog, ctx.vault.calls, "file-listing_list-files-when-asked");
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes("daily") || lowerText.includes("weekly") || lowerText.includes("ideas")
    ).toBe(true);
  }, { timeout: 6e4 });
  it("should list all files when asked for vault contents", async () => {
    const ctx = createTestContext({
      "readme.md": "# Readme",
      "notes/one.md": "# One",
      "notes/two.md": "# Two",
      "docs/api.md": "# API"
    });
    const history = [
      { role: "user", content: "List all files in my vault" }
    ];
    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });
    writeDebugLog(ctx.debugLog, ctx.vault.calls, "file-listing_list-all-vault-contents");
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    expect(result.text.length).toBeGreaterThan(20);
  }, { timeout: 6e4 });
  it("should handle empty directory", async () => {
    const ctx = createTestContext({
      "other/file.md": "# Other"
    });
    const history = [
      { role: "user", content: "What files are in the notes folder?" }
    ];
    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });
    writeDebugLog(ctx.debugLog, ctx.vault.calls, "file-listing_handle-empty-directory");
    const lowerText = result.text.toLowerCase();
    expect(
      lowerText.includes("no file") || lowerText.includes("empty") || lowerText.includes("not found") || lowerText.includes("doesn't exist")
    ).toBe(true);
  }, { timeout: 6e4 });
  it("should filter by file type when asked", async () => {
    const ctx = createTestContext({
      "notes/meeting.md": "# Meeting",
      "notes/tasks.md": "# Tasks",
      "notes/image.png": "binary data",
      "notes/data.json": '{"key": "value"}'
    });
    const history = [
      { role: "user", content: "What markdown files are in notes?" }
    ];
    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });
    writeDebugLog(ctx.debugLog, ctx.vault.calls, "file-listing_filter-by-file-type");
    expect(ctx.vault.calls.list.length).toBeGreaterThanOrEqual(1);
    const lowerText = result.text.toLowerCase();
    expect(lowerText.includes("meeting") || lowerText.includes("tasks")).toBe(true);
  }, { timeout: 6e4 });
  it("should drill down into nested directories", async () => {
    const ctx = createTestContext({
      "projects/web/index.md": "# Web Project",
      "projects/web/api.md": "# API Docs",
      "projects/mobile/readme.md": "# Mobile",
      "projects/archived/old.md": "# Old"
    });
    const history = [
      { role: "user", content: "Show me files in projects/web/" }
    ];
    const result = await runAgentLoop({
      history,
      buildPrompt: ctx.buildPrompt,
      model: ctx.model,
      toolRunner: ctx.toolRunner,
      maxTurns: 4,
      callbacks: ctx.debugCallbacks
    });
    writeDebugLog(ctx.debugLog, ctx.vault.calls, "file-listing_drill-down-nested");
    const webLists = ctx.vault.calls.list.filter(
      (c) => c.prefix.includes("projects/web") || c.prefix.includes("projects\\web")
    );
    expect(webLists.length).toBeGreaterThanOrEqual(1);
  }, { timeout: 6e4 });
});
