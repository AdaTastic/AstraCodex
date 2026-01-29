module.exports = {
  meta: {
    name: 'list',
    description: 'Search for vault files by substring match. Safe: does not attempt to scandir arbitrary prefixes.',
    params: { prefix: 'string' }
  },
  run: async ({ prefix }, ctx) => {
    const all = await ctx.vault.list('');
    const q = (prefix ?? '').toString().trim();

    // No query → return full list
    if (!q) return all;

    const qLower = q.toLowerCase();
    const qMdLower = (q.endsWith('.md') ? q : `${q}.md`).toLowerCase();

    const matches = all.filter((path) => {
      const p = path.toLowerCase();
      return p.includes(qLower) || p.includes(qMdLower);
    });

    // If no matches, return a message instead of failing silently
    if (matches.length === 0) {
      return {
        ok: false,
        message: `No vault files matched "${q}". Make sure the path or filename exists.`,
        query: q,
        count: 0
      };
    }

    return {
      ok: true,
      count: matches.length,
      results: matches
    };
  }
};
