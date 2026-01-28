import type { AstraCodexSettings } from './settings';

export interface ParsedHeader {
  state: string;
  needsConfirmation: boolean;
}

export interface ModelResponse {
  header: ParsedHeader;
  text: string;
}

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
    const contextLength = this.settings.contextSliderValue * 10; // Convert slider value to a meaningful length
    const url = `${this.settings.baseUrl}/api/generate`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.settings.model, prompt, stream: true }),
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

    const header = parseHeader(fullText);
    return { header, text: fullText };
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