# Fix Tool Extraction Issues

## Objective
Fix model output parsing to handle common failure modes where tool blocks are not executed.

## Problems Identified

### Problem 1: Multiple Tool Blocks → Both Rejected, Nothing Executes
**Evidence (chat-2026-01-29T04-41-35-848Z.json):**
```
rawText: "...</think>```tool...```STATE: acting\n\n```tool...```"
activityLine: null  // Tool never executed!
```
Model outputs 2 tool blocks, both get rejected, model gets confused.

### Problem 2: Tool Block After FINAL: Is Ignored
**Evidence (chat-2026-01-29T04-40-03-405Z.json):**
```
rawText: "FINAL: I'd be happy to read...ฅ^._.^ฅ\n<tool_call>\n```tool\n{...}\n```"
```
Our system strips everything after FINAL:, including the tool block.

### Problem 3: Tool Block Inside `</think>` Tags Is Lost
**Evidence:**
```
rawText: "...Let's call the tool.\n\n```tool\n{...}\n```</think>STATE: acting"
```
Think block gets stripped first, tool block vanishes.

## Proposed Fixes

### Fix 1: Extract tool blocks from rawText BEFORE stripping think/FINAL
Currently we:
1. Strip think blocks
2. Strip tool blocks
3. Try to extract tool

We should:
1. Extract tool from ORIGINAL rawText
2. THEN strip for display

### Fix 2: When multiple tool blocks detected, use the LAST one
Many models output "planning" tool blocks in think, then the "real" one after.
Take the last tool block, not first.

### Fix 3: Extract tool blocks that appear AFTER FINAL:
Currently `FINAL:` ends parsing. But tool blocks after FINAL: should still run.

## Step-by-Step Implementation (TDD)

1. [ ] Write test: tool block inside think tag should be extracted
2. [ ] Write test: tool block after FINAL: should be extracted
3. [ ] Write test: when multiple tool blocks, use the last one
4. [ ] Implement: change `extractFencedToolCall` to take raw text and find all tool blocks
5. [ ] Implement: return the LAST tool block instead of erroring on multiple
6. [ ] Run tests until green
7. [ ] Build and verify

## Files to Modify
- `toolOrchestrator.ts` - Main extraction logic
- `tests/toolOrchestrator.spec.ts` - New test cases
