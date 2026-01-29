# AstraCodex Codebase Issues Fix Plan

## Objective Summary
- **Goal**: Fix critical bugs and code quality issues in the AstraCodex Obsidian plugin
- **Success Criteria**: 
  1. All tests pass
  2. Build completes without errors
  3. No runtime crashes from identified bugs

## Scope Definition

### In Scope
- Fix infinite recursion in `ToolRunner.canAct()`
- Remove unused `contextSliderValue` or implement it properly
- Consolidate duplicate `ParsedHeader` type definition
- Add missing context slider UI control (if keeping the setting)

### Out of Scope
- Major refactoring of `view.ts` (large undertaking, separate task)
- Reviewing `canAct()` permission logic (requires user input on intended behavior)

### Assumptions
- The `contextSliderValue` was intended to control Ollama's context window but was never wired up

## Implementation Strategy

### Approach
1. **toolRunner.ts** - Rename the class method to avoid shadowing the callback
   ```pseudo
   // Before: canAct(): boolean { return this.canAct(); }  // infinite recursion
   // After: Use different naming - call stored callback properly
   ```

2. **modelClient.ts** - Either use `contextSliderValue` or remove it
   ```pseudo
   // Option A: Wire contextSliderValue to Ollama API num_ctx parameter
   // Option B: Remove unused code
   ```

3. **types.ts / modelClient.ts** - Remove duplicate `ParsedHeader`
   ```pseudo
   // Keep in types.ts, import in modelClient.ts
   ```

4. **main.ts** - Add slider UI for `contextSliderValue` OR remove the setting entirely

### Files to Modify
- `toolRunner.ts`
- `modelClient.ts`
- `settings.ts`
- `main.ts`

### New Files
- (none)

## Step-by-Step Plan
1. Fix `toolRunner.ts` - rename callback field to avoid method name collision
2. Update `modelClient.ts` - use `ParsedHeader` from `types.ts`, wire up `contextSliderValue` to Ollama
3. Update `main.ts` - add context slider to settings UI
4. Run tests to verify fixes
5. Run build to verify compilation

---
*This planning document must be completed and approved before any code changes begin.*
