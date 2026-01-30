# File Inspection Workflow

Use this workflow whenever the user asks to:
- read a file
- open/view a note
- summarize a note
- "what's in <note name>?"

## Workflow

1) If the user refers to the "current file" / "active note":
   - First request the active file path:

```xml
<tool_call>
{"name": "active_file", "arguments": {}}
</tool_call>
```

   - If the tool result is null, ask the user to open a file and try again.
   - If it returns a path, proceed to read that file.

2) Otherwise (including when the user provides a filename/title):
   - Always request a vault listing first so you can choose the best matching file path.
   - Do NOT call `read` directly using a guessed path or title.
   - This avoids errors like missing file extensions (e.g. `.md`) or wrong folders.

```xml
<tool_call>
{"name": "list", "arguments": {"prefix": ""}}
</tool_call>
```

3) After you have chosen a file path from the list results, read it:

```xml
<tool_call>
{"name": "read", "arguments": {"path": "chosen/file/path.md"}}
</tool_call>
```

4) If there are multiple plausible matches:
   - Ask the user which file they mean and show 3-7 candidates.
   - Wait for clarification before reading.

## Important

- Check conversation history for `[FILE: path]` entries before calling read again
- Never re-read a file that was already read in the current conversation
- After reading, summarize the content and ask the user what they want to do next
