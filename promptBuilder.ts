import type { AstraCodexSettings } from './settings';
import type { CoreRules } from './ruleManager';

interface PromptInput {
  userMessage: string;
  settings: AstraCodexSettings;
  coreRules: CoreRules;
  voiceOverride?: string;
  rules?: Record<string, string>;
  memory?: string;
  activeNote?: string;
  selection?: string;
  tools?: Array<{ name: string; description: string; params?: Record<string, string> }>;
}

const HEADER_REMINDER = `You MUST respond with a header in the format:\nSTATE: <state>\nNEEDS_CONFIRMATION: <true|false>\nPROPOSED_ACTION: <short description>\n`;

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
  activeNote,
  selection,
  tools
}: PromptInput): string => {
  const sections: string[] = [];
// Add sections for header reminder explicitly
const headerReminder = HEADER_REMINDER.split('\n').map(line => line.trim()).join('\n');
// Ensure each required section is explicitly added.
// Ensure each section of the header reminder is included correctly.
const headerLines = HEADER_REMINDER.trim().split('\n').map(line => line.trim());
sections.push(headerLines.filter(line =>
  ['STATE:', 'NEEDS_CONFIRMATION:', 'PROPOSED_ACTION:'].some(marker => line.startsWith(marker))
).join('\n'));
  sections.push(`Charter:\n${coreRules.charter}`);
  sections.push(`States:\n${coreRules.states}`);

  const voice = voiceOverride ?? coreRules.voice;
  if (voice?.trim()) {
    sections.push(`Voice:\n${voice}`);
  }

  if (rules && Object.keys(rules).length) {
    const rulesBlock = Object.entries(rules)
      .map(([name, content]) => `Rule: ${name}\n${content}`)
      .join('\n\n');
    sections.push(`Rules:\n${rulesBlock}`);
  }

  if (tools && tools.length > 0) {
    const toolBlock = tools
      .map((tool) => {
        const params = tool.params ? JSON.stringify(tool.params) : '{}';
        return `${tool.name}: ${tool.description} (params: ${params})`;
      })
      .join('\n');
    sections.push(`Tools:\n${toolBlock}`);
  }

// Update to clamp the full length including section header for effective max memory chars
// Handle memory truncation with valid checks.
if (typeof memory === 'string' && memory.trim().length > 0) {
  const trimmedMemory = `Memory: ${memory.trim()}`;
  sections.push(clamp(trimmedMemory, settings.maxMemoryChars + 50));
}

  if (activeNote?.trim()) {
    sections.push(`Active Note:\n${activeNote}`);
  }

  if (selection?.trim()) {
    sections.push(`Selection:\n${selection}`);
  }

  sections.push(`User Request:\n${userMessage}`);

  const full = sections.join('\n\n');
  const effectiveMaxLength = settings.contextSliderValue * 10; // Calculate max length based on context slider value
  return clamp(full, effectiveMaxLength);
};