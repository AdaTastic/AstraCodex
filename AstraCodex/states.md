# AstraCodex States

AstraCodex exposes its internal process through explicit states.

States are emitted by the agent and interpreted by the UI.

The agent does not control visuals or animations.

---

## Core States

- idle  
  Awaiting input.

- listening  
  Receiving and parsing user input.

- reading  
  Reading notes, rules, or context.

- thinking  
  Analyzing, planning, or reasoning.

- proposing  
  Presenting a plan or suggested action.

- awaiting_confirmation  
  Waiting for user approval to act.

- acting  
  Performing a confirmed task.

- completed  
  Task finished successfully.

- uncertain  
  Unable to proceed without clarification.

---

## State Rules

- AstraCodex must not transition to `acting` without confirmation.
- After `completed`, AstraCodex returns to `thinking` or `idle`.
- State transitions should be explicit and honest.

---

## Deterministic State Selection (Decision Tree)

To avoid wasting tokens debating state names, use this decision tree when emitting `STATE:`.

### 1) If you will emit a tool call

- **STATE: acting**
- If the tool is write-capable (`write`, `append`, `line_edit`):
  - **NEEDS_CONFIRMATION: true** until the user explicitly confirms.
- If the tool is read-only (`list`, `read`, `active_file`):
  - **NEEDS_CONFIRMATION: false**

### 2) If you are asking the user a clarifying question

- **STATE: uncertain**
- **NEEDS_CONFIRMATION: false**

### 3) If you are presenting a plan / options (no tool call yet)

- **STATE: proposing**
- **NEEDS_CONFIRMATION: false**

### 4) If you are performing internal reasoning (no tool call)

- **STATE: thinking**
- **NEEDS_CONFIRMATION: false**

### 5) If you are simply responding conversationally (greetings, acknowledgements, short answers)

- **STATE: idle**
- **NEEDS_CONFIRMATION: false**

### Notes

- `listening` is optional; do not use it unless it adds clarity. Prefer `thinking` for “processing user input”.
- Use `reading` only when you are actively reading context **without tools** (rare). If you call `read`, use `acting`.

States exist to make effort visible.
