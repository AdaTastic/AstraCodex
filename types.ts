export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  role: Role;
  text: string;
  header?: string;
  headerExpanded?: boolean;
  think?: string;
  thinkExpanded?: boolean;
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
