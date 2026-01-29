import type { AstraCodexSettings } from './settings';
import type { ParsedHeader } from './types';

export type { ParsedHeader };

export interface ModelResponse {
  header: ParsedHeader;
  text: string;
}

// Stop sequences to prevent hallucination - model should stop before generating fake user messages
const STOP_SEQUENCES = [
  'User:',
  '\nUser:',
  'Human:',
  '\nHuman:',
  'Memory:',
  '\nMemory:'
];

/**
 * Detects and truncates hallucinated conversation continuations.
 * Bug: Model sometimes continues generating "User: ...\nAssistant: ..." after its response.
 * Fix: Detect these patterns and truncate before them.
 */
const sanitizeResponse = (text: string): string => {
  // Look for hallucinated conversation markers after a line that looks like a response
  // These patterns indicate the model is roleplaying a multi-turn conversation
  const markers = [
    /\nUser: /,
    /\nHuman: /,
    /\nMemory: /,
    /\nAssistant: /  // Model shouldn't label its own continuation
  ];

  let truncateAt = text.length;
  for (const marker of markers) {
    const match = text.match(marker);
    if (match?.index !== undefined && match.index < truncateAt) {
      truncateAt = match.index;
    }
  }

  return text.slice(0, truncateAt);
};

export class ModelClient {
  private settings: AstraCodexSettings;
  private fetchImpl: typeof fetch;

  constructor(settings: AstraCodexSettings, fetchImpl?: typeof fetch) {
    this.settings = settings;
    const baseFetch = fetchImpl ?? globalThis.fetch;
    this.fetchImpl = baseFetch ? baseFetch.bind(globalThis) : fetch;
  }

  async generateStream(
    prompt: string,
    onDelta: (text: string) => void,
    opts?: {
      signal?: AbortSignal;
    }
  ): Promise<ModelResponse> {
    // Use maxContextChars to estimate context tokens (1 char ≈ 0.25 tokens for English)
    // Default to 32K tokens if not set
    const numCtx = Math.min(32768, Math.round(this.settings.maxContextChars * 0.25));
    const url = `${this.settings.baseUrl}/api/generate`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.model,
        prompt,
        stream: true,
        options: { 
          num_ctx: numCtx,
          stop: STOP_SEQUENCES  // Prevent hallucinated conversation continuations
        }
      }),
      signal: opts?.signal
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const chunk = JSON.parse(line) as { response?: string; done?: boolean };
      if (chunk.response) {
        fullText += chunk.response;
        onDelta(chunk.response);
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    if (buffer.trim()) {
      const chunk = JSON.parse(buffer) as { response?: string };
      if (chunk.response) {
        fullText += chunk.response;
        onDelta(chunk.response);
      }
    }

    // Sanitize response to remove any hallucinated conversation continuations
    const sanitizedText = sanitizeResponse(fullText);
    const header = parseHeader(sanitizedText);
    return { header, text: sanitizedText };
  }
}

export const parseHeader = (text: string): ParsedHeader => {
  const header: ParsedHeader = {
    state: 'idle',
    needsConfirmation: false
  };

  // Parse by key rather than fixed line count. Scan a small prefix to avoid
  // accidentally picking up tool output.
  const lines = text.split(/\r?\n/).slice(0, 40);
  for (const line of lines) {
    if (line.startsWith('STATE:')) {
      header.state = line.replace('STATE:', '').trim() || header.state;
    }
    if (line.startsWith('NEEDS_CONFIRMATION:')) {
      const value = line.replace('NEEDS_CONFIRMATION:', '').trim().toLowerCase();
      header.needsConfirmation = value === 'true';
    }
  }

  return header;
};
