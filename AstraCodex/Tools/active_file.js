module.exports = {
  meta: {
    name: 'active_file',
    description: 'Get the path of the currently active file in Obsidian (if any).',
    params: {}
  },
  run: async (_args, ctx) => {
    if (!ctx?.activeFilePath) return null;
    return ctx.activeFilePath;
  }
};
