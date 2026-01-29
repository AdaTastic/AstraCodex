# Tool Protocol

## Tool calls

The assistant may request tools using **either** of these formats:

### Format 1: Fenced Markdown (preferred)
```tool
{"name":"list","args":{"prefix":""},"retrigger":{"message":"..."}}
```

### Format 2: XML-style (alternative)
```
<tool_call>{"name":"read","args":{"path":"..."}}</tool_call>
```

Both formats are equivalent. Use whichever is natural for your model.

### Schema
- `name` (string): tool name.
- `args` (object): tool arguments.
- `retrigger.message` (string, optional): if provided, the application should re-run the model after tool execution.

## Safety
- `list` and `read` are safe operations and do NOT require confirmation.
- `write`, `append`, and `line_edit` are write-capable tools and DO require explicit user confirmation.

## Header state constraints
- `STATE:` must be one of the states listed in `AstraCodex/states.md`.
- Do not output translated state labels (e.g., avoid non-English tokens like "待命").

## State selection shortcut

When choosing `STATE:`, follow the deterministic decision tree in `AstraCodex/states.md`.
Do not spend tokens debating state labels.
