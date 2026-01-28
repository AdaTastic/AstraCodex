export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  role: Role;
  text: string;
  header?: string;
  headerExpanded?: boolean;
}

export interface ParsedHeader {
  state: string;
  needsConfirmation: boolean;
  proposedAction: string;
}

export interface OllamaResponse {
  response?: string;
  model?: string;
  created_at?: string;
  done?: boolean;
}
