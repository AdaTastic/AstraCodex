# Tool Protocol

## Tool Call Format

To use a tool, output a `<tool_call>` block with JSON inside:

```xml
<tool_call>
{"name": "read", "arguments": {"path": "file.md"}}
</tool_call>
```

### Schema
- `name` (string, required): The tool name
- `arguments` (object, optional): Tool-specific arguments

### Example Tool Calls

**List files:**
```xml
<tool_call>
{"name": "list", "arguments": {"prefix": "AstraCodex/"}}
</tool_call>
```

**Read a file:**
```xml
<tool_call>
{"name": "read", "arguments": {"path": "AstraCodex/Memory.md"}}
</tool_call>
```

**Write a file (requires confirmation):**
```xml
<tool_call>
{"name": "write", "arguments": {"path": "notes/new.md", "content": "# New Note\n\nContent here."}}
</tool_call>
```

## Agent Loop Behavior

1. You output a response with `<tool_call>` block
2. The system executes the tool
3. The tool result is added to conversation history as a `role: "tool"` message
4. You are called again with the updated history
5. You see the result and decide: output another tool call, OR provide your final answer in natural language
6. Loop continues until you respond without a `<tool_call>` block

**Important Rules:**
- Output AT MOST ONE tool block per response
- Do NOT output multiple tool calls - only the last one will be executed
- Do NOT include tool blocks inside `<think>` tags
- Tool results appear automatically in your conversation history

## CRITICAL: After Receiving Tool Results

When you see a tool result in the conversation (role: "tool" message), you MUST:
1. **STOP** calling tools
2. **READ** the tool result data
3. **RESPOND** to the user in plain English using that data

**NEVER repeat a tool call you already made.** The data is already in the conversation!

### Example Flow

```
User: "what files are in notes?"
You: <tool_call>{"name": "list", "arguments": {"prefix": "notes"}}</tool_call>
Tool result: ["notes/daily.md", "notes/weekly.md"]
You: "The notes folder contains daily.md and weekly.md." ← CORRECT
You: <tool_call>{"name": "list"...}</tool_call> ← WRONG (don't repeat!)
```

**Key principle:** If your previous message was a tool_call, your NEXT message should be natural language.

## Error Handling

- If a tool returns "ERROR:", acknowledge the error and try alternatives
- If asked to fallback to another file, do so automatically
- If an operation fails repeatedly, explain the issue to the user

## Safety

- `list` and `read` are safe operations and do NOT require confirmation
- `write`, `append`, and `line_edit` are write-capable tools and DO require explicit user confirmation

## Available Tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `list` | `prefix` (string) | List files/folders with given prefix |
| `read` | `path` (string) | Read file contents |
| `write` | `path`, `content` (strings) | Write/create file (confirmation required) |
| `append` | `path`, `content` (strings) | Append to file (confirmation required) |
| `line_edit` | `path`, `startLine`, `endLine`, `newContent` | Edit specific lines (confirmation required) |
| `active_file` | (none) | Get currently active file path |
