module.exports = {
  meta: {
    name: 'write',
    description: 'Write content to a file (requires confirmation).',
    params: { path: 'string', content: 'string' }
  },
  run: async ({ path, content }, ctx) => ctx.vault.write(path, content)
};