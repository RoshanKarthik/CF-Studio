/** Only what the parser needs: the statements (with their problem index) and the tag boxes. */
export function statementHtml(): string | null {
  const statements = [...document.querySelectorAll('.problem-statement')];
  if (!statements.length) return null;
  const holders = new Set(statements.map((s) => s.closest('[problemindex]') ?? s));
  const tags = [...document.querySelectorAll('.tag-box')].map((t) => t.outerHTML).join('');
  return `<div>${tags}</div>${[...holders].map((h) => h.outerHTML).join('')}`;
}
