import { describe, expect, it } from 'vitest';

// Minimal smoke test of the exact patterns we expect in assistant output.
// (We keep this here even though the parsing lives in view.ts, because it
// defines the contract we want the UI to satisfy.)

const extractThink = (text: string): { think: string | null; rest: string } => {
  const match = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) return { think: null, rest: text };
  const think = match[1].trim();
  const rest = (text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length)).trim();
  return { think: think || null, rest };
};

describe('<think> parsing', () => {
  it('extracts <think>...</think> and removes it from the rest', () => {
    const input = '<think>\nhello\n</think>\nSTATE: idle\nNEEDS_CONFIRMATION: false\n\nHi';
    const out = extractThink(input);
    expect(out.think).toBe('hello');
    expect(out.rest).toContain('STATE: idle');
    expect(out.rest).not.toContain('<think>');
  });
});
