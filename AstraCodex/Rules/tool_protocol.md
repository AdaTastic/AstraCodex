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

**CRITICAL: When to Stop Using Tools**
- After receiving tool results that answer the user's question, **RESPOND IN NATURAL LANGUAGE**
- Do NOT repeat the same tool call if you already have the information you need
- Your response should be a helpful answer to the user, not another tool call
- Example: If user asks "what files are in notes?" and you get `["notes/daily.md", "notes/weekly.md"]`, respond with: "The notes folder contains daily.md and weekly.md."

**Important:**
- Output AT MOST ONE tool block per response
- Do NOT output multiple tool calls - only the last one will be executed
- Tool results appear automatically in your conversation history
- After seeing tool results, provide a natural language answer - don't loop!

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
