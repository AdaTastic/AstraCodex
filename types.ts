export type Role = 'user' | 'assistant' | 'system';

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
