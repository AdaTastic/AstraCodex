export const deriveChatTitle = (firstUserMessage: string, maxLen = 40): string => {
  const normalized = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Chat';
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
};
