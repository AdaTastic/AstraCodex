import type { AstraCodexSettings } from './settings';
import type { CoreRules } from './ruleManager';

interface PromptInput {
  userMessage: string;
  settings: AstraCodexSettings;
  coreRules: CoreRules;
  voiceOverride?: string;
  rules?: Record<string, string>;
  memory?: string;
  /** OpenAI-style JSON array of conversation history */
  history?: string;
  activeNote?: string;
  selection?: string;
  tools?: Array<{ name: string; description: string; params?: Record<string, string> }>;
}

// Minimal header - detailed rules are in AstraCodex/Rules/*.md files
const HEADER_REMINDER = `RESPONSE FORMAT:
- Use <think>...</think> tags for internal reasoning (both tags required)
- Everything outside <think> tags is shown to the user
- For tools, use <tool_call>{"name": "...", "arguments": {...}}</tool_call>
- Output AT MOST ONE tool block per response
- After receiving tool results, respond in natural language - don't repeat tool calls
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
  activeNote,
  selection,
  tools
}: PromptInput): string => {
  // Detect if the conversation ends with a tool result
  const historyEndsWithToolResult = history?.includes('"role": "tool"') && 
    history.trim().endsWith('}') &&
    history.lastIndexOf('"role": "tool"') > history.lastIndexOf('"role": "user"');
  
  const contextSections: string[] = [];
  const headerSection = HEADER_REMINDER.trim();

  contextSections.push(`Charter:\n${coreRules.charter}`);

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

  // History contains everything including tool results (OpenAI format)
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

  // Build user request section with tool result reminder if needed
  let userRequestSection = `User Request:\n${userMessage}`;
  if (historyEndsWithToolResult) {
    userRequestSection += `\n\n⚠️ TOOL RESULT AVAILABLE - You already called a tool and received data above. DO NOT call the same tool again. Respond to the user in natural language using the data you received.`;
  }
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
