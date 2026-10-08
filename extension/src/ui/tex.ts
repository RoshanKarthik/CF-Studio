import katex from 'katex';
import 'katex/dist/katex.min.css';

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(tex: string): string {
  return tex.replace(/<[^>]*>/g, '').replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g, (_, e: string) => ENTITIES[e]);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
}

function render(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(decode(tex), { displayMode, throwOnError: false, strict: 'ignore', trust: false });
  } catch {
    return `<code>${escapeHtml(decode(tex))}</code>`;
  }
}

/** Replace Codeforces' `$$$...$$$` (inline) and `$$$$$$...$$$$$$` (display) TeX with KaTeX HTML. */
export function renderTex(html: string): string {
  return html
    .replace(/\$\$\$\$\$\$([\s\S]+?)\$\$\$\$\$\$/g, (_, tex: string) => render(tex, true))
    .replace(/\$\$\$([\s\S]+?)\$\$\$/g, (_, tex: string) => render(tex, false));
}
