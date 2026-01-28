import { describe, expect, it } from 'vitest';
import { deriveChatTitle } from '../chatTitle';

describe('deriveChatTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(deriveChatTitle('  hello\n\nworld  ', 40)).toBe('hello world');
  });

  it('truncates long titles with an ellipsis', () => {
    const title = deriveChatTitle('A'.repeat(100), 10);
    expect(title).toBe('AAAAAAAAA…');
    expect(title.length).toBe(10);
  });
});
