module.exports = {
  meta: {
    name: 'line_edit',
    description: 'Replace a range of lines with new content and return a preview.',
    params: {
      path: 'string',
      startLine: 'number',
      endLine: 'number',
      replacement: 'string'
    }
  },
  run: async ({ path, startLine, endLine, replacement }, ctx) => {
    const content = await ctx.vault.read(path);
    const lines = content.split(/\r?\n/);
    const startIdx = Math.max(1, startLine) - 1;
    const endIdx = Math.min(lines.length, endLine) - 1;
    const before = lines.slice(startIdx, endIdx + 1).join('\n');
    const updatedLines = [
      ...lines.slice(0, startIdx),
      ...replacement.split(/\r?\n/),
      ...lines.slice(endIdx + 1)
    ];
    return {
      path,
      preview: {
        startLine,
        endLine,
        before,
        after: replacement
      },
      updatedContent: updatedLines.join('\n')
    };
  }
};