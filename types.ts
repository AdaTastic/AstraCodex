export type Role = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Derived state for UI (face animation, status indicators).
 * Code-derived from actual events, not model output.
 */
export type DerivedState =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'searching'
  | 'writing'
  | 'appending'
  | 'editing'
  | 'checking'
  | 'awaiting_confirmation'
  | 'error';

/**
 * Result display for a tool execution.
 */
export interface ToolResultDisplay {
  type: 'list' | 'read' | 'write' | 'append' | 'line_edit' | 'active_file' | 'error';
  /** For list tool - the files found */
  items?: string[];
  /** For read/write tools - the file path */
  path?: string;
  /** For read tool - preview of content */
  preview?: string;
  /** For write tools - success message */
  success?: boolean;
  /** For errors */
  error?: string;
}

/**
 * A segment of an assistant message.
 * Messages are split at tool call boundaries for agentic display.
 */
export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'tool'; activity: string; toolName: string; result?: ToolResultDisplay };

/**
 * Tool call in OpenAI format.
 */
export interface ToolCallInfo {
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: Role;
  text: string;
  header?: string;
  headerExpanded?: boolean;
  think?: string;
  thinkExpanded?: boolean;
  /** Raw streamed model output (includes tool blocks, header lines, etc.) */
  rawText?: string;
  /** Display-only tool activity line derived from a parsed tool block. */
  activityLine?: string | null;
  /** Parsed segments for agentic display (text interspersed with tool calls) */
  segments?: MessageSegment[];
  /** Tool calls made in this message (for assistant role) */
  toolCalls?: ToolCallInfo[];
  /** Tool result content (for tool role) */
  toolResult?: unknown;
  /** ID linking tool result to tool call */
  toolCallId?: string;
}

export interface ParsedHeader {
  state: string;
  needsConfirmation: boolean;
}

export interface OllamaResponse {
  response?: string;
  model?: string;
  created_at?: string;
  done?: boolean;
}
