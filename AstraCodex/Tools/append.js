module.exports = {
  meta: {
    name: 'append',
    description: 'Append content to a file (requires confirmation).',
    params: { path: 'string', content: 'string' }
  },
  run: async ({ path, content }, ctx) => ctx.vault.append(path, content)
};