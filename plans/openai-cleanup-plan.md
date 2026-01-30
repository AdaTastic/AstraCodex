# OpenAI Format Cleanup Plan

## Objective Summary
- **Goal**: Clean up AstraCodex to use proper OpenAI-compatible formats, remove duplicate data, fix UI issues
- **Success Criteria**: 
  - Model stops repeating tool calls
  - Chat logs are minimal and clean
  - UI renders tool activity from tool_calls data
  - No scroll lock during generation

---

## TDD Workflow

Each phase follows Red → Green → Refactor:

1. **RED**: Write failing test(s) that specify the expected behavior
2. **GREEN**: Write minimal code to make test pass
3. **REFACTOR**: Clean up while keeping tests green

**Test file naming:** `tests/{module}.spec.ts`

**Run tests:** `npm run test`

---

## Current Problems

### 1. Model Outputs Old Format
Model still outputs:
```json
{"name": "list", "args": {...}, "retrigger": {...}}
```
Should be:
```json
{"name": "list", "arguments": {...}}
```

### 2. Duplicate Data in Chat Logs
```json
{
  "text": "...",           // display text
  "rawText": "...",        // same as text (duplicate)
  "activityLine": "...",   // derived from toolCalls (duplicate)
  "header": "STATE: idle", // internal state leaked
  "headerExpanded": false  // UI state (shouldn't persist)
}
```

### 3. Model Repeats Tool Calls
Model calls `read` on same file 6+ times because:
- History format doesn't clearly show what was already done
- No instruction to avoid repeating

### 4. UI Issues
- Can't scroll during generation
- STATE: lines visible in chat
- Header toggle clutters UI

---

## Target Formats

### Tool Call Format (Model Output)
```xml
<tool_call>
{
  "name": "read",
  "arguments": {
    "path": "file.md"
  }
}
</tool_call>
```

### Chat Log Message Format (Storage)
```json
{
  "role": "assistant",
  "content": "I'll read that file for you.",
  "tool_calls": [{"name": "read", "arguments": {"path": "file.md"}}]
}
```

```json
{
  "role": "tool",
  "content": "[file content here]",
  "tool_call_id": "0-read"
}
```

### Removed Fields
- `text` → renamed to `content`
- `rawText` → REMOVED (just keep content)
- `activityLine` → REMOVED (derived at render time)
- `header` → REMOVED (internal state only)
- `headerExpanded` → REMOVED (UI state)
- `thinkExpanded` → REMOVED (UI state)

---

## Implementation Plan

### Phase 1: Tool Format (toolOrchestrator.ts)

**File:** `toolOrchestrator.ts`

```typescript
// Current: accepts args OR arguments
const argsSource = parsed.arguments ?? parsed.args;

// Keep this fallback for GLM compatibility, but:
// 1. Remove retrigger extraction entirely
// 2. Only parse <tool_call>{JSON}</tool_call>
// 3. Return clean { name, arguments } only
```

**Changes:**
- [x] Already accepts `args` fallback - KEEP
- [ ] Verify retrigger is not being extracted
- [ ] Ensure `extractFencedToolCall` only parses `<tool_call>` XML format

---

### Phase 2: Prompt Updates (promptBuilder.ts)

**File:** `promptBuilder.ts`

Update `HEADER_REMINDER` to:
1. Remove STATE output requirement
2. Add instruction to not repeat tool calls
3. Show only `arguments` format (not `args`)

**New HEADER_REMINDER:**
```
RESPONSE FORMAT:

If you need to think through your reasoning, wrap it in <think>...</think> tags.
Everything OUTSIDE <think> tags is shown directly to the user.

TOOL CALLS:
To use a tool, output a tool_call block:

<tool_call>
{"name": "read", "arguments": {"path": "file.md"}}
</tool_call>

Rules:
- Output AT MOST ONE tool block per response
- Do NOT repeat tool calls you already made (check conversation history)
- Tool results appear in history - use them, don't re-request

DO NOT output "STATE:" headers.
```

---

### Phase 3: Types Cleanup (types.ts)

**File:** `types.ts`

```typescript
export interface Message {
  role: Role;
  content: string;  // renamed from text
  // UI-only (not persisted):
  think?: string;
  // Tool data:
  tool_calls?: ToolCallInfo[];  // renamed from toolCalls
  tool_result?: unknown;        // renamed from toolResult
  tool_call_id?: string;        // renamed from toolCallId
}
```

**Changes:**
- [ ] Rename `text` → `content`
- [ ] Rename `toolCalls` → `tool_calls`
- [ ] Rename `toolResult` → `tool_result`
- [ ] Rename `toolCallId` → `tool_call_id`
- [ ] Remove `rawText`
- [ ] Remove `activityLine`
- [ ] Remove `header`
- [ ] Remove `headerExpanded`
- [ ] Remove `thinkExpanded`

---

### Phase 4: Chat Storage (chatStore.ts, chatSession.ts)

**File:** `chatStore.ts`

Update save/load to use new field names. Add migration for old chats.

**File:** `chatSession.ts`

Update `restoreChatState` to handle both old and new formats.

```typescript
// Migration: convert old format to new
const migrateMessage = (msg: any): Message => ({
  role: msg.role,
  content: msg.content ?? msg.text ?? '',
  tool_calls: msg.tool_calls ?? msg.toolCalls,
  tool_result: msg.tool_result ?? msg.toolResult,
  tool_call_id: msg.tool_call_id ?? msg.toolCallId,
  think: msg.think
});
```

---

### Phase 5: Conversation History (conversationHistory.ts)

**File:** `conversationHistory.ts`

Output format for model:
```json
[
  {"role": "user", "content": "Read file.md"},
  {"role": "assistant", "content": "Reading...", "tool_calls": [{"name": "read", "arguments": {"path": "file.md"}}]},
  {"role": "tool", "content": "[FILE CONTENT]", "tool_call_id": "0-read"}
]
```

**Changes:**
- [ ] Use `content` instead of inline construction
- [ ] Remove `[TOOL RESULT: name]` prefix (redundant with tool_call_id)
- [ ] Make format match OpenAI exactly

---

### Phase 6: Agent Loop (agentLoop.ts)

**File:** `agentLoop.ts`

**Changes:**
- [ ] Use `content` field instead of `text`
- [ ] Use snake_case for tool fields
- [ ] Remove rawText storage

---

### Phase 7: View/UI (view.ts, messageRenderer.ts)

**File:** `view.ts`

**Changes:**
- [ ] Remove Header toggle UI entirely
- [ ] Derive activity line from `tool_calls` at render time
- [ ] Fix scroll lock: don't call `scrollTop = scrollHeight` on every delta
- [ ] Use `content` field instead of `text`

**Activity Line Derivation:**
```typescript
const getActivityLine = (msg: Message): string | null => {
  if (!msg.tool_calls?.length) return null;
  return formatToolActivity(msg.tool_calls[0]);
};
```

**Scroll Fix:**
```typescript
// Only auto-scroll if user is already at bottom
const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
if (isAtBottom) {
  el.scrollTop = el.scrollHeight;
}
```

---

### Phase 8: Text Parser (textParser.ts)

**File:** `textParser.ts`

**Changes:**
- [ ] Strip STATE: lines from display
- [ ] Update `extractHeaderAndBody` to not return header (just strip it)
- [ ] Use `content` field

---

### Phase 9: Tools (AstraCodex/Tools/*.js)

All tool scripts need to ensure they use `arguments` not `args`.

**Files:**
- `AstraCodex/Tools/active_file.js`
- `AstraCodex/Tools/append.js`
- `AstraCodex/Tools/line_edit.js`
- `AstraCodex/Tools/list.js`
- `AstraCodex/Tools/read.js`
- `AstraCodex/Tools/write.js`

**Check each file for:**
```javascript
// These should access arguments (toolRunner handles this)
// Tools receive arguments object directly
module.exports = async function(args, vault) {
  // args is already the arguments object
}
```

**No changes needed** - toolRunner already extracts `arguments` and passes to tool.

---

### Phase 10: Rules Documentation (AstraCodex/Rules/tool_protocol.md)

**File:** `AstraCodex/Rules/tool_protocol.md`

Update to show only:
```xml
<tool_call>
{"name": "tool_name", "arguments": {"param": "value"}}
</tool_call>
```

Remove:
- Old fenced format
- retrigger documentation
- args (only use arguments)

---

## Implementation Order

1. **types.ts** - Update field names
2. **toolOrchestrator.ts** - Ensure clean extraction
3. **promptBuilder.ts** - Update model instructions
4. **agentLoop.ts** - Use new field names
5. **conversationHistory.ts** - Clean output format
6. **textParser.ts** - Strip STATE, use content
7. **view.ts** - Remove headers, fix scroll, derive activity
8. **chatSession.ts** - Add migration logic
9. **chatStore.ts** - Use new format
10. **tool_protocol.md** - Update documentation
11. **Build & Test**

---

## Testing Checklist (Unit)

- [ ] Model outputs `<tool_call>` with `arguments`
- [ ] Tool calls execute correctly
- [ ] History shows clean format
- [ ] Model doesn't repeat same tool calls
- [ ] UI shows activity lines (derived)
- [ ] No STATE: in visible messages
- [ ] Can scroll during generation
- [ ] Old chat logs load correctly (migration)

---

## Phase 11: E2E Test Pipeline

**Purpose:** Test actual model behavior with real prompts

**Directory:** `tests/e2e/`

**Files:**
- `tests/e2e/file-reading.e2e.ts`
- `tests/e2e/file-listing.e2e.ts`
- `tests/e2e/file-writing.e2e.ts`
- `tests/e2e/multi-step.e2e.ts`

**Example test:**
```typescript
// tests/e2e/file-reading.e2e.ts
import { describe, it, expect } from 'vitest';
import { runAgentLoop } from '../../agentLoop';

describe.skip('E2E: File Reading', () => {
  it('should read a file without repeating the call', async () => {
    const mockVault = createMockVault({ 'test.md': '# Hello World' });
    const prompt = "Read test.md";
    
    const result = await runAgentLoop({
      history: [{ role: 'user', content: prompt }],
      // ... config
    });
    
    // Verify file was read exactly once
    expect(mockVault.readCalls).toHaveLength(1);
    // Verify model didn't repeat the tool call
    const toolMessages = result.history.filter(m => m.role === 'tool');
    expect(toolMessages).toHaveLength(1);
  });
});
```

**npm scripts (add to package.json):**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:e2e": "vitest run tests/e2e --no-file-parallelism"
  }
}
```

**Notes:**
- E2E tests use `describe.skip` by default (requires model connection)
- Remove `.skip` to run against actual model
- Run manually: `npm run test:e2e`
- Separate from CI to avoid failures

---

## TDD Implementation Order

### Phase 1: types.ts
```
RED:   Write test asserting Message has `content` field (not `text`)
GREEN: Update Message interface
```

### Phase 2: toolOrchestrator.ts
```
RED:   Write test for extracting <tool_call> with `arguments`
RED:   Write test that retrigger is ignored
GREEN: Update extraction logic
```

### Phase 3: promptBuilder.ts
```
RED:   Write test that HEADER_REMINDER contains "arguments" not "args"
RED:   Write test that STATE instruction is removed
GREEN: Update HEADER_REMINDER constant
```

### Phase 4: agentLoop.ts
```
RED:   Write test using `content` field
RED:   Write test for snake_case tool fields
GREEN: Update to use new field names
```

### Phase 5: conversationHistory.ts
```
RED:   Write test for OpenAI-compatible JSON output
RED:   Write test that content field is used
GREEN: Update buildConversationHistory
```

### Phase 6: textParser.ts
```
RED:   Write test that STATE: lines are stripped
RED:   Write test using `content` field
GREEN: Update parsing functions
```

### Phase 7: view.ts
```
RED:   Write test for scroll behavior (if possible)
RED:   Write test for activity line derivation
GREEN: Update UI rendering
```

### Phase 8: chatSession.ts
```
RED:   Write test for migration from old format
GREEN: Add migrateMessage function
```

### Phase 9: E2E Tests
```
Create test/e2e/ directory
Write skipped E2E test cases
Add npm script
```

### Phase 10: Documentation
```
Update AstraCodex/Rules/tool_protocol.md
```
