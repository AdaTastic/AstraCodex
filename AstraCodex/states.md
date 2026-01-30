# AstraCodex States

AstraCodex tracks internal process through states. These are managed by the system, not the model.

---

## Core States (Internal)

The UI displays these states based on model activity:

- **idle** - Awaiting input
- **thinking** - Analyzing, planning, or reasoning
- **acting** - Executing a tool
- **completed** - Task finished

---

## State Rules

- Write operations (`write`, `append`, `line_edit`) require user confirmation
- Read operations (`list`, `read`, `active_file`) do not require confirmation
- State transitions are handled automatically by the agent loop

---

## Note

States are tracked internally by the system. The model does not need to output state information - it is inferred from model activity (tool calls, responses, etc.).
