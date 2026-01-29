import type { AstraCodexSettings } from './settings';
import type { CoreRules } from './ruleManager';

interface PromptInput {
  userMessage: string;
  settings: AstraCodexSettings;
  coreRules: CoreRules;
  voiceOverride?: string;
  rules?: Record<string, string>;
  memory?: string;
  history?: string;
  lastDocument?: { path: string; content: string } | null;
  activeNote?: string;
  selection?: string;
  tools?: Array<{ name: string; description: string; params?: Record<string, string> }>;
}

const HEADER_REMINDER = `RESPONSE FORMAT:

If you need to think through your reasoning, wrap it in <think>...</think> tags:
<think>
Your internal reasoning here...
</think>
Your user-facing response here.

Everything OUTSIDE <think> tags is shown directly to the user.
IMPORTANT: Always include BOTH <think> and </think> tags if you use them.

TOOL CALLS:
See AstraCodex/Rules/tool_protocol.md for supported formats.
- Output AT MOST ONE tool block per response
- Do NOT include tool blocks inside <think> tags
- If you output multiple tool blocks, only the last one will be executed

FILE READING GUIDANCE:
- If the user asks to read a file by name/title, call \`list\` first to find the correct path.
- Only call \`read\` after you have a specific vault path.

Your response should be clean and conversational - no headers, no prefixes.
`;

const clamp = (value: string, maxChars: number): string => {
  if (maxChars <= 0) return '';
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
};

export const buildPrompt = ({
  userMessage,
  settings,
  coreRules,
  voiceOverride,
  rules,
  memory,
  history,
  lastDocument,
  activeNote,
  selection,
  tools
}: PromptInput): string => {
  const contextSections: string[] = [];
  const headerSection = HEADER_REMINDER.trim();

  contextSections.push(`Charter:\n${coreRules.charter}`);
  contextSections.push(`States:\n${coreRules.states}`);

  const voice = voiceOverride ?? coreRules.voice;
  if (voice?.trim()) {
    contextSections.push(`Voice:\n${voice}`);
  }

  if (rules && Object.keys(rules).length) {
    const rulesBlock = Object.entries(rules)
      .map(([name, content]) => `Rule: ${name}\n${content}`)
      .join('\n\n');
    contextSections.push(`Rules:\n${rulesBlock}`);
  }

  if (tools && tools.length > 0) {
    const toolBlock = tools
      .map((tool) => {
        const params = tool.params ? JSON.stringify(tool.params) : '{}';
        return `${tool.name}: ${tool.description} (params: ${params})`;
      })
      .join('\n');
    contextSections.push(`Tools:\n${toolBlock}`);
  }

  // IMPORTANT: lastDocument comes BEFORE history so it survives truncation.
  // The model needs to remember what it just read more than old conversation turns.
  if (lastDocument?.content?.trim()) {
    contextSections.push(`Last Document Context (${lastDocument.path}):\n${lastDocument.content.trim()}`);
  }

  // History is lower priority - can be truncated if context is tight.
  if (typeof history === 'string' && history.trim().length > 0) {
    contextSections.push(`Conversation History:\n${history.trim()}`);
  }

// Update to clamp the full length including section header for effective max memory chars
// Handle memory truncation with valid checks.
  if (typeof memory === 'string' && memory.trim().length > 0) {
    const trimmedMemory = `Memory: ${memory.trim()}`;
    contextSections.push(clamp(trimmedMemory, settings.maxMemoryChars + 50));
  }

  if (activeNote?.trim()) {
    contextSections.push(`Active Note:\n${activeNote}`);
  }

  if (selection?.trim()) {
    contextSections.push(`Selection:\n${selection}`);
  }

  const userRequestSection = `User Request:\n${userMessage}`;
  // Prefer the explicit maxContextChars budget. The context slider controls it indirectly,
  // but we must ensure the model actually sees Rules/Tools.
  const maxLength = settings.maxContextChars;
  if (maxLength <= 0) return '';

  const contextCombined = [headerSection, ...contextSections].join('\n\n');
  const separator = contextCombined ? '\n\n' : '';
  const full = contextCombined ? `${contextCombined}${separator}${userRequestSection}` : userRequestSection;

  if (full.length <= maxLength) {
    return full;
  }

  const availableForContext = maxLength - (separator.length + userRequestSection.length);
  if (availableForContext > 0) {
    const truncatedContext = clamp(contextCombined, availableForContext);
    return `${truncatedContext}${separator}${userRequestSection}`;
  }

  const headerPlusSeparatorLength = headerSection.length + 2;
  if (maxLength > headerPlusSeparatorLength) {
    const truncatedUser = clamp(userRequestSection, maxLength - headerPlusSeparatorLength);
    return `${headerSection}\n\n${truncatedUser}`;
  }

  return clamp(userRequestSection, maxLength);
};
