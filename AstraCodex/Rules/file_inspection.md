# File Inspection Workflow

Use this workflow whenever the user asks to:
- read a file
- open/view a note
- summarize a note
- "what's in <note name>?"

## Workflow

1) If the user refers to the "current file" / "active note":
   - First request the active file path:

```tool
{"name":"active_file","args":{},"retrigger":{"message":"If the tool result is null, ask the user to open a file and try again. If it is a path, request a read of that path."}}
```

2) Otherwise (including when the user provides a filename/title):
   - Always request a vault listing first so you can choose the best matching file path.
   - Do NOT call `read` directly using a guessed path or title.
   - This avoids errors like missing file extensions (e.g. `.md`) or wrong folders.

```tool
{"name":"list","args":{"prefix":""},"retrigger":{"message":"From the file list above, choose the best matching file path. If unsure, ask the user to clarify. If sure, request a read of the chosen file."}}
```

3) After you have chosen a file path, read it:

```tool
{"name":"read","args":{"path":"<chosen-path>"},"retrigger":{"message":"Summarize the file content above. Then ask the user what they want to do next."}}
```

4) If there are multiple plausible matches:
- Ask the user which file they mean and show 3-7 candidates.

```tool
{"name":"list","args":{"prefix":""},"retrigger":{"message":"From the file list above, choose the best matching file path. If unsure, ask the user to clarify. If sure, request a read of the chosen file."}}
```
