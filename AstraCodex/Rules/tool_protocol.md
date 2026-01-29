# Tool Protocol

## Tool calls

The assistant may request tools **only** using a fenced tool block:

```tool
{"name":"list","args":{"prefix":""},"retrigger":{"message":"..."}}
```

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
