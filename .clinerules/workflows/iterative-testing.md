# Iterative E2E Testing Workflow

## Purpose
Systematic improvement of model behavior through targeted e2e testing. Fix one problem at a time, validate real-world behavior, avoid test-hacking.

## Test Files (Run in Order)
1. `file-listing.e2e.ts` - Model can list files in vault
2. `file-reading.e2e.ts` - Model can read file contents
3. `file-writing.e2e.ts` - Model can write/create/append files
4. `multi-step.e2e.ts` - Model chains multiple tool calls

## Commands

### Run single test file:
```bash
npm run test:e2e -- tests/e2e/file-listing.e2e.ts
```

### Run all e2e tests:
```bash
npm run test:e2e
```

---

## Per-Test Process

### Step 1: RUN TEST
```bash
npm run test:e2e -- tests/e2e/[current-test].e2e.ts
```

### Step 2: OBSERVE OUTPUT
Read the console output carefully:
- What did the model actually output?
- What tool calls were made (if any)?
- What was the expected vs actual result?
- Did it timeout or error?

### Step 3: DIAGNOSE ROOT CAUSE

Classify the failure into one of these categories:

| Category | Symptom | Example |
|----------|---------|---------|
| **A) Prompt/Rules Issue** | Model doesn't understand the task | "I can help you list files" but no tool call |
| **B) Format Issue** | Model outputs malformed tool syntax | Missing closing tag, wrong JSON structure |
| **C) Logic Issue** | Model uses wrong tool or arguments | Uses `read` when should use `list` |
| **D) Test Issue** | Test expectations unrealistic | Expects exact text match when behavior is correct |

### Step 4: FIX (One Change at a Time)

**Priority order for fixes:**

1. **Prompt clarity** → `AstraCodex/Rules/*.md`
   - Clarify when to use which tool
   - Add examples of correct behavior
   
2. **System guidance** → `AstraCodex/charter.md`, `AstraCodex/states.md`
   - High-level behavior expectations
   
3. **Format parsing** → `toolOrchestrator.ts`, `textParser.ts`
   - Handle model output variations
   - Only if model format is reasonable but we're too strict
   
4. **Test adjustment** → `tests/e2e/*.e2e.ts` (LAST RESORT)
   - Only if test is genuinely wrong
   - MUST document why in a comment

### Step 5: VALIDATE REAL-WORLD BEHAVIOR

Before marking "fixed", ask:
- [ ] Would this work for a real user request?
- [ ] Are we teaching the model correct behavior?
- [ ] Did we introduce regressions to other tests?
- [ ] Is the fix generalizable or just for this test case?

### Step 6: REPEAT
- Re-run the test
- If still failing, go back to Step 2
- If passing, move to next test file

---

## Anti-Patterns to Avoid

### ❌ Test Hacking
Making the test pass without fixing actual behavior.
- Bad: `expect(result).toContain('list')` → `expect(result).toBeTruthy()`
- Good: Fix prompt so model actually uses list tool

### ❌ Over-parsing
Writing elaborate code to interpret garbage output.
- Bad: "Model outputs markdown table, let me parse that"
- Good: Fix prompt so model outputs correct tool format

### ❌ Fixing Multiple Issues at Once
Making several changes then re-testing.
- Bad: Edit 3 rules files, change parser, then run test
- Good: One change → test → observe → repeat

### ❌ Ignoring Regressions
Assuming other tests still work.
- Bad: Fix file-listing, never run file-reading again
- Good: Periodically run `npm run test:e2e` for all tests

---

## Checklist for Each Test

```
[ ] Run single test: npm run test:e2e -- tests/e2e/[name].e2e.ts
[ ] Read full console output
[ ] Identify root cause category (A/B/C/D)
[ ] Make ONE targeted fix
[ ] Re-run test
[ ] Verify fix makes sense for real users
[ ] Run all tests to check for regressions
[ ] Commit when test passes
```

---

## Files You May Need to Modify

| Problem Type | Files to Check |
|--------------|----------------|
| Model doesn't know when to use tools | `AstraCodex/Rules/tool_protocol.md` |
| Model doesn't understand file operations | `AstraCodex/Rules/file_inspection.md` |
| Tool call format issues | `toolOrchestrator.ts` |
| Text parsing issues | `textParser.ts` |
| Prompt structure | `promptBuilder.ts` |
| Test is too strict | `tests/e2e/*.e2e.ts` (document why!) |
