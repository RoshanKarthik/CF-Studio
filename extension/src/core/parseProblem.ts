import type { Problem, Sample } from './types';

/** Where a Codeforces URL points, or null if it isn't a problem page. */
export interface ProblemRef {
  kind: 'contest' | 'gym';
  contestId: string;
  /** Problem index ("A", "B1"), or null for the all-problems page of a contest. */
  index: string | null;
}

const URL_PATTERNS: { re: RegExp; kind: 'contest' | 'gym'; all?: boolean }[] = [
  { re: /^\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/, kind: 'contest' },
  { re: /^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)\/?$/, kind: 'contest' },
  { re: /^\/gym\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/, kind: 'gym' },
  { re: /^\/contest\/(\d+)\/problems\/?$/, kind: 'contest', all: true },
  { re: /^\/gym\/(\d+)\/problems\/?$/, kind: 'gym', all: true },
];

export function parseProblemUrl(url: string): ProblemRef | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  for (const { re, kind, all } of URL_PATTERNS) {
    const m = re.exec(path);
    if (m) return { kind, contestId: m[1], index: all ? null : m[2].toUpperCase() };
  }
  return null;
}

/**
 * Parse every problem statement on a Codeforces page: one for a problem page, all of them for a
 * contest's /problems page. Expects the raw server HTML (before MathJax runs), so TeX is still
 * `$$$...$$$` text.
 */
export function parseProblemPage(doc: Document, url: string): Problem[] {
  const ref = parseProblemUrl(url);
  if (!ref) return [];
  const statements = [...doc.querySelectorAll<HTMLElement>('.problem-statement')];
  const sidebar = statements.length === 1 ? parseSidebar(doc) : { tags: [], rating: null };
  return statements.map((original) => {
    const holder = original.closest('[problemindex]');
    const el = original.cloneNode(true) as HTMLElement;
    restoreTex(el);
    const index = (holder?.getAttribute('problemindex') ?? ref.index ?? titleIndex(el) ?? '?').toUpperCase();
    return parseStatement(el, { ...ref, index }, url, sidebar);
  });
}

const MATHJAX_OUTPUT = '.MathJax_Preview, .MathJax, .MathJax_Display, .MathJax_SVG, .MathJax_SVG_Display, .MathJax_CHTML, mjx-container';

/**
 * On a live page MathJax has already replaced `$$$x$$$` with rendered markup plus a
 * `<script type="math/tex">x</script>` holding the source. Put the `$$$` text back so the
 * statement parses the same whether it comes from raw HTML or the rendered page.
 */
export function restoreTex(root: Element): void {
  for (const node of root.querySelectorAll(MATHJAX_OUTPUT)) node.remove();
  for (const script of root.querySelectorAll('script[type^="math/tex"]')) {
    const display = /mode\s*=\s*display/.test(script.getAttribute('type') ?? '');
    const tex = script.textContent ?? '';
    script.replaceWith(display ? `$$$$$$${tex}$$$$$$` : `$$$${tex}$$$`);
  }
}

function titleIndex(el: HTMLElement): string | null {
  const title = text(el.querySelector('.header .title'));
  return /^([A-Za-z0-9]+)\./.exec(title)?.[1] ?? null;
}

function parseStatement(
  el: HTMLElement,
  ref: ProblemRef & { index: string },
  url: string,
  sidebar: { tags: string[]; rating: number | null },
): Problem {
  const header = el.querySelector('.header');
  const sections: Record<'legend' | 'input' | 'output' | 'interaction' | 'note', string> = {
    legend: '',
    input: '',
    output: '',
    interaction: '',
    note: '',
  };
  let samples: Sample[] = [];

  for (const child of el.children) {
    if (child === header) continue;
    const cls = child.classList;
    if (cls.contains('sample-tests')) {
      samples = parseSamples(child);
    } else if (cls.contains('input-specification')) {
      sections.input = sectionBody(child, url);
    } else if (cls.contains('output-specification')) {
      sections.output = sectionBody(child, url);
    } else if (cls.contains('note')) {
      sections.note = sectionBody(child, url);
    } else if (/^interaction$/i.test(text(child.querySelector(':scope > .section-title')))) {
      sections.interaction = sectionBody(child, url);
    } else if (!sections.legend) {
      sections.legend = sectionBody(child, url);
    }
  }

  const id = (ref.kind === 'gym' ? 'gym' : '') + ref.contestId + ref.index;
  const legendText = el.textContent ?? '';
  return {
    id,
    contestId: ref.contestId,
    index: ref.index,
    kind: ref.kind,
    url,
    title: text(header?.querySelector('.title')) || `${ref.index}.`,
    timeLimitMs: parseTimeLimit(propertyValue(header, '.time-limit')),
    memoryLimitMb: parseMemoryLimit(propertyValue(header, '.memory-limit')),
    inputFile: ioFile(header, 'input'),
    outputFile: ioFile(header, 'output'),
    legendHtml: sections.legend,
    inputHtml: sections.input,
    outputHtml: sections.output,
    interactionHtml: sections.interaction,
    noteHtml: sections.note,
    samples,
    tags: sidebar.tags,
    rating: sidebar.rating,
    interactive: Boolean(sections.interaction) || /this is an interactive problem/i.test(legendText),
  };
}

/** Header rows look like `<div class="time-limit"><div class="property-title">time limit per test</div>2 seconds</div>`. */
function propertyValue(header: Element | null | undefined, selector: string): string {
  const row = header?.querySelector(selector);
  if (!row) return '';
  const clone = row.cloneNode(true) as Element;
  clone.querySelector('.property-title')?.remove();
  return text(clone);
}

/**
 * "standard input"/"standard output", or the file name. Codeforces writes standard I/O as either
 * "standard input" or "stdin", and marks it with an `input-standard` class.
 */
function ioFile(header: Element | null | undefined, kind: 'input' | 'output'): string {
  const standard = `standard ${kind}`;
  const row = header?.querySelector(`.${kind}-file`);
  const value = propertyValue(header, `.${kind}-file`);
  if (!row || row.classList.contains(`${kind}-standard`) || !value) return standard;
  return /^(standard (input|output)|std(in|out))$/i.test(value) ? standard : value;
}

export function parseTimeLimit(value: string): number {
  const m = /([\d.]+)\s*(milli)?second/i.exec(value);
  if (!m) return 2000;
  const n = Number(m[1]);
  return Math.round(m[2] ? n : n * 1000);
}

export function parseMemoryLimit(value: string): number {
  const m = /([\d.]+)\s*(kilo|mega|giga)?bytes/i.exec(value);
  if (!m) return 256;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'mega').toLowerCase();
  return Math.round(unit === 'kilo' ? n / 1024 : unit === 'giga' ? n * 1024 : n);
}

function parseSamples(container: Element): Sample[] {
  const inputs = [...container.querySelectorAll('.input pre')].map(preText);
  const outputs = [...container.querySelectorAll('.output pre')].map(preText);
  return inputs.map((input, i) => ({ input, output: outputs[i] ?? '' }));
}

/**
 * Sample text. Newer statements wrap each input line in `div.test-example-line`; older ones use
 * `<br>` inside the `<pre>`. Either way we want plain text with one trailing newline.
 */
export function preText(pre: Element): string {
  const lines = pre.querySelectorAll(':scope > .test-example-line');
  let raw: string;
  if (lines.length) {
    raw = [...lines].map((l) => l.textContent ?? '').join('\n');
  } else {
    const clone = pre.cloneNode(true) as Element;
    for (const br of clone.querySelectorAll('br')) br.replaceWith('\n');
    raw = clone.textContent ?? '';
  }
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
  return normalized ? normalized + '\n' : '';
}

function parseSidebar(doc: Document): { tags: string[]; rating: number | null } {
  const tags: string[] = [];
  let rating: number | null = null;
  for (const box of doc.querySelectorAll('.tag-box')) {
    const t = text(box);
    const m = /^\*(\d+)$/.exec(t);
    if (m) rating = Number(m[1]);
    else if (t) tags.push(t);
  }
  return { tags, rating };
}

/** A section's HTML without its "Input"/"Output"/"Note" heading. */
function sectionBody(section: Element, baseUrl: string): string {
  const clone = section.cloneNode(true) as Element;
  clone.querySelector(':scope > .section-title')?.remove();
  return sanitize(clone, baseUrl);
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// --- sanitizing -----------------------------------------------------------------------------

const KEEP = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sup', 'sub', 'ul', 'ol', 'li', 'center', 'div',
  'span', 'pre', 'code', 'tt', 'img', 'a', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr',
  'blockquote', 'small',
]);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'noscript', 'svg', 'math']);
const ATTRS: Record<string, string[]> = {
  img: ['src', 'alt', 'width', 'height'],
  a: ['href', 'title'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

/**
 * Rebuild `root`'s children from an allowlist of tags and attributes. Unknown tags are unwrapped
 * (their text kept); scripts, forms, event handlers and non-http(s) links are dropped.
 */
export function sanitize(root: Element, baseUrl: string): string {
  const doc = root.ownerDocument;
  const out = doc.createElement('div');
  const copy = (src: Node, dest: Node) => {
    for (const node of src.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        dest.appendChild(doc.createTextNode(node.textContent ?? ''));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (!KEEP.has(tag)) {
        copy(el, dest);
        continue;
      }
      const clean = doc.createElement(tag);
      for (const name of ATTRS[tag] ?? []) {
        const value = el.getAttribute(name);
        if (value === null) continue;
        if (name === 'src' || name === 'href') {
          const abs = safeUrl(value, baseUrl);
          if (abs) clean.setAttribute(name, abs);
        } else {
          clean.setAttribute(name, value);
        }
      }
      const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => /^[\w-]+$/.test(c));
      if (classes.length) clean.setAttribute('class', classes.join(' '));
      if (tag === 'a') {
        clean.setAttribute('target', '_blank');
        clean.setAttribute('rel', 'noopener noreferrer');
      }
      copy(el, clean);
      dest.appendChild(clean);
    }
  };
  copy(root, out);
  return out.innerHTML.trim();
}

function safeUrl(value: string, baseUrl: string): string | null {
  try {
    const u = new URL(value, baseUrl);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
