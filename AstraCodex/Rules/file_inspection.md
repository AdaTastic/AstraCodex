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

2) If the user provides an **explicit path** (e.g., "chapter1.md", "notes/meeting.md"):
   - You can read directly without calling list first
   - Include the .md extension if not specified

```xml
<tool_call>
{"name": "read", "arguments": {"path": "chapter1.md"}}
</tool_call>
```

3) If the user provides an **ambiguous name** (e.g., "the meeting notes", "that project file"):
   - Request a vault listing first so you can choose the best matching file path.
   - This avoids errors like missing file extensions or wrong folders.

**IMPORTANT:** Use empty string `""` as prefix to list all files. Do NOT use `"."` - that won't work!

```xml
<tool_call>
{"name": "list", "arguments": {"prefix": ""}}
</tool_call>
```

4) After you have chosen a file path from the list results, read it:

```xml
<tool_call>
{"name": "read", "arguments": {"path": "chosen/file/path.md"}}
</tool_call>
```

5) If there are multiple plausible matches:
   - Ask the user which file they mean and show 3-7 candidates.
   - Wait for clarification before reading.

## Critical File Reading Rules

1. **NEVER re-read a file that was already read** - check Conversation History for `[FILE: path]` entries or previous tool results
2. **If user gives an ambiguous filename** (no path), call `list` first to find the full path
3. **Only call `read` after you have a specific vault path** from list results

## Multi-File Reading

When the user asks to read multiple files (e.g., "read all chapters", "read files X, Y, and Z", "summarize these notes"):

1. **Read ALL files before responding** - do NOT summarize or give a final answer until every requested file has been read
2. **Read one file per turn** - call `read` for each file sequentially
3. **Track progress** - after each read, identify which files remain and continue to the next
4. **Only respond after all files are read** - the user expects a combined summary/response based on ALL the content

**Example flow for reading multiple files:**
- Turn 1: `read("folder/doc1.md")` → receive content
- Turn 2: `read("folder/doc2.md")` → receive content  
- Turn 3: `read("folder/doc3.md")` → receive content
- Turn 4: Now respond with combined summary using all files

**WRONG:** Reading one file and immediately summarizing
**RIGHT:** Reading all requested files first, then providing comprehensive response

## After Reading

- Summarize the content for the user
- Ask what they want to do next (if appropriate)
- If the file was already read earlier in the conversation, reference that content instead of reading again
