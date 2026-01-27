export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  role: Role;
  text: string;
}

export interface OllamaResponse {
  response?: string;
  model?: string;
  created_at?: string;
  done?: boolean;
}
