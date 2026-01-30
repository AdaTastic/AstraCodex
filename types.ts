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

/**
 * Message in OpenAI-compatible format.
 * 
 * Field naming follows OpenAI convention (snake_case for tool-related fields).
 */
export interface Message {
  role: Role;
  /** Message content (renamed from 'text' for OpenAI compatibility) */
  content: string;
  /** Thinking/reasoning content (shown in collapsible UI) */
  think?: string;
  /** Parsed segments for agentic display (text interspersed with tool calls) */
  segments?: MessageSegment[];
  /** Tool calls made in this message (for assistant role) - OpenAI format */
  tool_calls?: ToolCallInfo[];
  /** Tool result content (for tool role) - OpenAI format */
  tool_result?: unknown;
  /** ID linking tool result to tool call - OpenAI format */
  tool_call_id?: string;
  
  // UI-only fields (not sent to model, used for rendering)
  /** Raw model output before parsing (for debugging) */
  rawText?: string;
  /** Activity line (e.g., "reading: file.md") */
  activityLine?: string | null;
  /** Think block expanded state */
  thinkExpanded?: boolean;
  /** Header expanded state */
  headerExpanded?: boolean;
  /** Header text (deprecated, but kept for legacy rendering) */
  header?: string;
  /** Display text (alias for content, legacy compatibility) */
  text?: string;
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
