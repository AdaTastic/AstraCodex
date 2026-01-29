# OpenAI-Compatible Format Migration Plan

## Objective Summary
- **Goal**: Migrate AstraCodex to use OpenAI-compatible formats for tool calls and conversation history
- **Success Criteria**: 
  - GLM model successfully calls and executes tools
  - Conversation history flows naturally without format confusion

## Scope Definition

### In Scope
- Tool call format migration (args → arguments, new XML wrapper)
- Conversation history format migration (text lines → JSON array)
- **Remove `lastDocument` context** - file content lives in history only
- Files to change:
  - `toolOrchestrator.ts` - Parse new format, remove retrigger
  - `conversationHistory.ts` - Output JSON array with role:"tool" messages
  - `promptBuilder.ts` - Remove lastDocument, format history as JSON
  - `textParser.ts` - Strip/segment new format
  - `types.ts` - Update Message type
  - `agentLoop.ts` - Inject tool results, loop until no tool_calls
  - `AstraCodex/Rules/tool_protocol.md` - Document new format
  - `AstraCodex/Tools/*.js` - Change args → arguments

### Out of Scope
- Switching to Ollama structured API (staying with text parsing)

### Key Changes

1. **Remove Retrigger Field**
   - Old: Model outputs `retrigger.message` to trigger itself
   - New: Agent loop injects tool result as `role:"tool"`, model continues naturally

2. **Remove lastDocument**
   - Old: Separate `lastDocument` context section in prompt
   - New: File content flows through history as tool results

3. **Full History Persistence**
   - Tool results appended as `role:"tool"` messages
   - Entire history passed to model each turn
   - Context window = memory (no separate database needed)

## Implementation Strategy

### Part 1: Tool Call Format

**Current:**
```
```tool
{"name":"read","args":{"path":"file.md"},"retrigger":{"message":"..."}}
```
```

**New (OpenAI-style):**
```xml
<tool_call>
{"name": "read", "arguments": {"path": "file.md"}}
</tool_call>
```

**No more `retrigger` field** - the agent loop handles continuation automatically.

**Pseudo-code for toolOrchestrator.ts:**
```
extractToolCall(text):
  // Find <tool_call>{JSON}</tool_call>
  match = text.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/i)
  if match:
    json = parseJSON(match[1])
    return { name: json.name, arguments: json.arguments }
  return null

stripToolBlocks(text):
  // Remove <tool_call>...</tool_call>
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
```

### Part 2: Conversation History Format

**Current output in prompt:**
```
Conversation History:
User: What's in the file?
Assistant: Let me read it.

Last Document Context (file.md):
[file content here]
```

**New output (OpenAI-style JSON in prompt):**
```
Conversation History:
[
  {"role": "user", "content": "What's in the file?"},
  {"role": "assistant", "content": "Let me read it.", "tool_calls": [{"name": "read", "arguments": {"path": "file.md"}}]},
  {"role": "tool", "content": "{\"path\":\"file.md\",\"content\":\"[file content here]\"}"},
  {"role": "assistant", "content": "Here's what the file says..."}
]
```

**Key difference:** File content is now embedded in the tool result message, not a separate section.

**Pseudo-code for conversationHistory.ts:**
```
buildConversationHistory(messages):
  result = []
  for msg in messages:
    if msg.role == 'user':
      result.push({ role: 'user', content: msg.text })
    elif msg.role == 'assistant':
      entry = { role: 'assistant', content: stripToolBlocks(msg.text) }
      if msg.toolCalls:
        entry.tool_calls = msg.toolCalls
      result.push(entry)
    elif msg.role == 'tool':
      result.push({ role: 'tool', content: JSON.stringify(msg.toolResult) })
  return JSON.stringify(result, null, 2)
```

### Part 3: Agent Loop Flow

```
User Request
    ↓
Build Prompt (system + history + user message)
    ↓
Call Model
    ↓
Parse Response
    ↓
Has tool_calls? ──No──> Done (display response)
    │
   Yes
    ↓
Execute Tool
    ↓
Append to History:
  1. Assistant message with tool_calls
  2. Tool message with result
    ↓
Loop Back (call model again with updated history)
```

**Loop continues until model returns response without tool_calls.**

## Step-by-Step Plan

### 1. toolOrchestrator.ts
- [ ] Change `ToolCall.args` → `ToolCall.arguments`
- [ ] **Remove `retrigger` field entirely**
- [ ] Update `extractFencedToolCall` to parse `<tool_call>{JSON}</tool_call>` only
- [ ] Update `stripToolBlocks` to strip `<tool_call>...</tool_call>`
- [ ] Update `formatToolActivity` to use `.arguments`
- [ ] Update `executeToolCall` to not return retriggerMessage

### 2. types.ts ✅
- [x] Add `role: 'tool'` to Role type
- [x] Add `ToolCallInfo` interface
- [x] Add `toolCalls` field to Message
- [x] Add `toolResult` field to Message

### 3. agentLoop.ts
- [ ] **Remove retrigger handling**
- [ ] **Add tool result injection** - append `role:"tool"` message after execution
- [ ] **Loop until no tool_calls** - continue calling model until response has no tool_calls
- [ ] Remove `lastDocument` state handling

### 4. conversationHistory.ts
- [ ] Change output from text lines to JSON array
- [ ] Include `tool_calls` in assistant entries when present
- [ ] Include `role: "tool"` entries for tool results

### 5. promptBuilder.ts
- [ ] **Remove `lastDocument` parameter and context section**
- [ ] Update HEADER_REMINDER with new tool format
- [ ] Format history as `Conversation History:\n{JSON}`

### 6. textParser.ts
- [ ] Update regex for `<tool_call>` format only
- [ ] Update `cleanSegmentText` stripping

### 7. AstraCodex/Rules/tool_protocol.md
- [ ] Document new format with examples
- [ ] Remove old fenced format documentation
- [ ] Document agent loop behavior

### 8. AstraCodex/Tools/*.js
- [ ] active_file.js: `args` → `arguments`
- [ ] append.js: `args` → `arguments`
- [ ] line_edit.js: `args` → `arguments`
- [ ] list.js: `args` → `arguments`
- [ ] read.js: `args` → `arguments`
- [ ] write.js: `args` → `arguments`

### 9. Build & Test
- [ ] Run `npm run build`
- [ ] Test with GLM model
- [ ] Verify multi-step tool sequences work (list → read → summarize)
