module.exports = {
  meta: {
    name: 'read',
    description: 'Read a file from the vault.',
    params: { path: 'string' }
  },
  run: async ({ path }, ctx) => ctx.vault.read(path)
};