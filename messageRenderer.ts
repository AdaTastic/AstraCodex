import type { Message, ParsedHeader, MessageSegment } from './types';
import { stripToolBlocks, formatToolActivity } from './toolOrchestrator';
import { extractThink, extractHeaderAndBody, extractFinal, getActivityLine, parseMessageSegments } from './textParser';

export interface MessageRenderElements {
  transcriptEl: HTMLElement;
}

/**
 * Renders all messages to the transcript element.
 */
export const renderMessages = (
  messages: Message[],
  transcriptEl: HTMLElement,
  onToggleHeader: (index: number) => void,
  onToggleThink: (index: number) => void,
  options?: { preserveScroll?: boolean }
): void => {
  // Remember scroll position
  const isAtBottom = transcriptEl.scrollTop + transcriptEl.clientHeight >= transcriptEl.scrollHeight - 50;
  
  (transcriptEl as any).empty();
  
  messages.forEach((msg, index) => {
    const row = (transcriptEl as any).createDiv({ cls: ['agentic-chat-row', `role-${msg.role}`] });
    const bubble = row.createDiv({ cls: 'agentic-chat-bubble' });
    const label = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : 'System';
    bubble.createDiv({ cls: 'agentic-chat-label', text: label });

    // Tool messages (System) - make collapsible, collapsed by default
    if (msg.role === 'tool') {
      const toolHeader = bubble.createDiv({ cls: 'agentic-chat-tool-header' });
      const toolName = msg.tool_call_id?.split('-').pop() ?? 'tool';
      toolHeader.createDiv({ cls: 'agentic-chat-tool-activity', text: `${toolName} result` });
      
      const toggleBtn = toolHeader.createDiv({ 
        cls: 'agentic-chat-tool-toggle',
        text: '▸ Show'
      });
      
      const resultContainer = bubble.createDiv({ cls: 'agentic-chat-tool-result-container' });
      resultContainer.style.display = 'none'; // Collapsed by default
      resultContainer.createDiv({ cls: 'agentic-chat-text', text: msg.content ?? '' });
      
      toggleBtn.addEventListener('click', () => {
        const isHidden = resultContainer.style.display === 'none';
        resultContainer.style.display = isHidden ? 'block' : 'none';
        (toggleBtn as any).setText(isHidden ? '▾ Hide' : '▸ Show');
      });
      return; // Skip to next message
    }

    if (msg.role === 'assistant' && msg.header) {
      const headerToggle = bubble.createDiv({
        cls: 'agentic-chat-header-toggle',
        text: msg.headerExpanded ? 'Header ▾' : 'Header ▸'
      });
      headerToggle.addEventListener('click', () => onToggleHeader(index));

      if (msg.headerExpanded) {
        bubble.createDiv({ cls: 'agentic-chat-header-text', text: msg.header });
      }
    }

    if (msg.role === 'assistant' && msg.think) {
      const thinkToggle = bubble.createDiv({
        cls: 'agentic-chat-header-toggle',
        text: msg.thinkExpanded ? 'Think ▾' : 'Think ▸'
      });
      thinkToggle.addEventListener('click', () => onToggleThink(index));

      if (msg.thinkExpanded) {
        bubble.createDiv({ cls: 'agentic-chat-header-text', text: msg.think });
      }
    }

    // Render segments for agentic display (assistant messages with segments)
    if (msg.role === 'assistant' && msg.segments && msg.segments.length > 0) {
      renderSegments(bubble, msg.segments);
    } else {
      // Fallback to legacy single-text rendering
      let displayText =
        msg.text && msg.text.trim().length > 0
          ? msg.text
          : msg.role === 'assistant' && msg.think
            ? '(No final answer was produced — expand Think)'
            : msg.text;
      
      // If STILL empty, show content or rawText as last resort
      if ((!displayText || !displayText.trim()) && msg.role === 'assistant') {
        if (msg.content && msg.content.trim()) {
          displayText = msg.content;
        } else if (msg.rawText && msg.rawText.trim()) {
          displayText = '(Parsing error — raw output below)';
          bubble.createDiv({ cls: 'agentic-chat-text agentic-chat-muted', text: displayText });
          const rawContainer = bubble.createDiv({ cls: 'agentic-chat-raw-fallback' });
          rawContainer.createEl('pre', { text: msg.rawText.slice(0, 500) + (msg.rawText.length > 500 ? '...' : '') });
          return; // Skip normal text rendering
        }
      }

      if (msg.role === 'assistant' && msg.activityLine) {
        bubble.createDiv({ cls: 'agentic-chat-tool-activity', text: msg.activityLine });
      }

      bubble.createDiv({ cls: 'agentic-chat-text', text: displayText });
    }
  });
  
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
};

/**
 * Renders message segments (text and tool calls) in sequence.
 * Tool calls get their own collapsible box, collapsed by default.
 */
const renderSegments = (bubble: HTMLElement, segments: MessageSegment[]): void => {
  for (const segment of segments) {
    if (segment.type === 'text') {
      if (segment.content.trim()) {
        (bubble as any).createDiv({ cls: 'agentic-chat-text-segment', text: segment.content });
      }
    } else if (segment.type === 'tool') {
      const toolBox = (bubble as any).createDiv({ cls: 'agentic-chat-tool-box' });
      
      // Header row with activity and toggle
      const headerRow = toolBox.createDiv({ cls: 'agentic-chat-tool-header' });
      headerRow.createDiv({ cls: 'agentic-chat-tool-activity', text: segment.activity });
      
      // Toggle buttons container
      const toggleContainer = headerRow.createDiv({ cls: 'agentic-chat-tool-toggles' });
      
      // Raw text container (collapsible, collapsed by default)
      const rawContainer = toolBox.createDiv({ cls: 'agentic-chat-tool-raw-container' });
      rawContainer.style.display = 'none';
      
      // Add raw toggle if rawText exists
      if (segment.rawText) {
        const rawToggleBtn = toggleContainer.createDiv({ 
          cls: 'agentic-chat-tool-toggle',
          text: '▸ Raw'
        });
        
        rawToggleBtn.addEventListener('click', () => {
          const isHidden = rawContainer.style.display === 'none';
          rawContainer.style.display = isHidden ? 'block' : 'none';
          (rawToggleBtn as any).setText(isHidden ? '▾ Raw' : '▸ Raw');
        });
        
        const rawEl = rawContainer.createDiv({ cls: 'agentic-chat-tool-raw' });
        rawEl.createEl('pre', { text: segment.rawText });
      }
      
      // Tool result (collapsible, collapsed by default)
      if (segment.result) {
        const resultContainer = toolBox.createDiv({ cls: 'agentic-chat-tool-result-container' });
        resultContainer.style.display = 'none'; // Collapsed by default
        
        const toggleBtn = toggleContainer.createDiv({ 
          cls: 'agentic-chat-tool-toggle',
          text: '▸ Result'
        });
        
        toggleBtn.addEventListener('click', () => {
          const isHidden = resultContainer.style.display === 'none';
          resultContainer.style.display = isHidden ? 'block' : 'none';
          (toggleBtn as any).setText(isHidden ? '▾ Result' : '▸ Result');
        });
        
        renderToolResult(resultContainer, segment.result);
      }
    }
  }
};

/**
 * Renders a tool result display.
 */
const renderToolResult = (container: HTMLElement, result: NonNullable<Extract<MessageSegment, { type: 'tool' }>['result']>): void => {
  const resultEl = (container as any).createDiv({ cls: 'agentic-chat-tool-result' });
  
  if (result.type === 'list' && result.items) {
    // Show file list with folder/file icons
    const listEl = resultEl.createDiv({ cls: 'agentic-chat-file-list' });
    const displayItems = result.items.slice(0, 10); // Limit display
    for (const item of displayItems) {
      const isFolder = item.endsWith('/');
      const icon = isFolder ? '📁' : '📄';
      listEl.createDiv({ cls: 'agentic-chat-file-item', text: `├─ ${icon} ${item}` });
    }
    if (result.items.length > 10) {
      listEl.createDiv({ cls: 'agentic-chat-file-item', text: `└─ ... and ${result.items.length - 10} more` });
    }
  } else if (result.type === 'read' && result.path) {
    resultEl.createDiv({ cls: 'agentic-chat-read-result', text: `📄 ${result.path}` });
    if (result.preview) {
      const previewEl = resultEl.createDiv({ cls: 'agentic-chat-preview' });
      previewEl.createEl('pre', { text: result.preview.slice(0, 200) + (result.preview.length > 200 ? '...' : '') });
    }
  } else if ((result.type === 'write' || result.type === 'append' || result.type === 'line_edit') && result.success) {
    resultEl.createDiv({ cls: 'agentic-chat-write-result', text: `✅ ${result.path ?? 'File updated'}` });
  } else if (result.type === 'error' && result.error) {
    resultEl.createDiv({ cls: 'agentic-chat-error-result', text: `❌ ${result.error}` });
  }
};

/**
 * Updates the last assistant message with new streaming text.
 * Parses think blocks, headers, tool activity, and segments.
 */
export const updateLastAssistantMessage = (
  messages: Message[],
  text: string,
  parsedHeader: ParsedHeader | null
): string | null => {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;

  // Persist raw model output for debugging
  last.rawText = text;

  // Parse segments for agentic display
  last.segments = parseMessageSegments(text);

  // Get activity line from tool blocks (legacy, for backwards compat)
  const activityLine = getActivityLine(text, formatToolActivity);
  last.activityLine = activityLine;

  // Remove tool blocks from visible text
  const withoutToolBlocks = stripToolBlocks(text);
  
  // Extract think block
  const { think, rest } = extractThink(withoutToolBlocks);
  if (think) {
    last.think = think;
    if (typeof last.thinkExpanded !== 'boolean') last.thinkExpanded = false;
  }

  // Extract header and body
  const { header, body } = extractHeaderAndBody(rest);
  const { final } = extractFinal(body);
  
  if (header) {
    last.header = header;
    last.text = final ?? body;
  } else if (parsedHeader) {
    last.header = `STATE: ${parsedHeader.state}\nNEEDS_CONFIRMATION: ${parsedHeader.needsConfirmation}`;
    const { final: finalFromRest } = extractFinal(rest);
    last.text = finalFromRest ?? rest;
  } else {
    const { final: finalFromRest } = extractFinal(rest);
    last.text = finalFromRest ?? rest;
  }

  return activityLine;
};

/**
 * Creates a new message and adds it to the messages array.
 */
export const pushMessage = (
  messages: Message[],
  role: Message['role'],
  content: string,
  header?: string
): void => {
  messages.push({ role, content, text: content, header, headerExpanded: false });
};
