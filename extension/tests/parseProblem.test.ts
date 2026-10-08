import { describe, expect, it } from 'vitest';
import { parseMemoryLimit, parseProblemPage, parseProblemUrl, parseTimeLimit, sanitize } from '../src/core/parseProblem';
import FIXTURE from '../src/preview/fixture.html?raw';

const URL_A = 'https://codeforces.com/contest/2001/problem/A';

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('parseProblemUrl', () => {
  it.each([
    ['https://codeforces.com/contest/1234/problem/a', { kind: 'contest', contestId: '1234', index: 'A' }],
    ['https://codeforces.com/problemset/problem/1234/B1', { kind: 'contest', contestId: '1234', index: 'B1' }],
    ['https://codeforces.com/gym/100001/problem/C', { kind: 'gym', contestId: '100001', index: 'C' }],
    ['https://codeforces.com/contest/1234/problems', { kind: 'contest', contestId: '1234', index: null }],
  ])('%s', (url, ref) => {
    expect(parseProblemUrl(url)).toEqual(ref);
  });

  it('rejects non-problem pages', () => {
    expect(parseProblemUrl('https://codeforces.com/problemset')).toBeNull();
    expect(parseProblemUrl('https://codeforces.com/contest/1234/standings')).toBeNull();
    expect(parseProblemUrl('not a url')).toBeNull();
  });
});

describe('parseProblemPage', () => {
  const [p] = parseProblemPage(doc(FIXTURE), URL_A);

  it('reads the header', () => {
    expect(p.id).toBe('2001A');
    expect(p.title).toBe('A. Balanced Stones');
    expect(p.timeLimitMs).toBe(1000);
    expect(p.memoryLimitMb).toBe(256);
    expect(p.inputFile).toBe('standard input');
    expect(p.interactive).toBe(false);
  });

  it('reads samples in both Codeforces formats', () => {
    expect(p.samples).toEqual([
      { input: '3\n3\n1 2 3\n2\n1 2\n4\n4 0 0 4\n', output: '2\n-1\n4\n' },
      { input: '1\n5\n0 0 10 0 0\n', output: '12\n' },
    ]);
  });

  it('reads tags and hides the rating tag from them', () => {
    expect(p.tags).toEqual(['greedy', 'math']);
    expect(p.rating).toBe(1200);
  });

  it('splits sections and strips headings and scripts', () => {
    expect(p.legendHtml).toContain('$$$a_i$$$');
    expect(p.legendHtml).not.toContain('script');
    expect(p.inputHtml).not.toContain('section-title');
    expect(p.outputHtml).toContain('$$$-1$$$');
    expect(p.noteHtml).toContain('third pile');
  });

  it('parses every problem on a contest /problems page', () => {
    const two = FIXTURE.replace(
      '</div>\n</body>',
      FIXTURE.slice(FIXTURE.indexOf('<div class="problemindexholder"'), FIXTURE.indexOf('</div>\n</body>'))
        .replace('problemindex="A"', 'problemindex="B"')
        .replace('A. Balanced Stones', 'B. Second') + '</div>\n</body>',
    );
    const problems = parseProblemPage(doc(two), 'https://codeforces.com/contest/2001/problems');
    expect(problems.map((x) => x.id)).toEqual(['2001A', '2001B']);
    expect(problems[1].title).toBe('B. Second');
    // Tags in the sidebar belong to a single problem, so they're not guessed for a whole contest.
    expect(problems[0].tags).toEqual([]);
  });

  it('detects interactive problems', () => {
    const html = `<div class="problem-statement"><div class="header"><div class="title">C. Guess</div></div>
      <div><p>This is an interactive problem.</p></div>
      <div><div class="section-title">Interaction</div><p>Print "? x".</p></div></div>`;
    const [q] = parseProblemPage(doc(html), 'https://codeforces.com/contest/5/problem/C');
    expect(q.interactive).toBe(true);
    expect(q.interactionHtml).toContain('? x');
  });
});

describe('limits', () => {
  it.each([
    ['1 second', 1000],
    ['2.5 seconds', 2500],
    ['500 milliseconds', 500],
    ['garbage', 2000],
  ])('time %s', (s, ms) => expect(parseTimeLimit(s)).toBe(ms));

  it.each([
    ['256 megabytes', 256],
    ['1 gigabytes', 1024],
    ['65536 kilobytes', 64],
  ])('memory %s', (s, mb) => expect(parseMemoryLimit(s)).toBe(mb));
});

describe('sanitize', () => {
  const clean = (html: string) => sanitize(doc(`<div id="x">${html}</div>`).getElementById('x')!, URL_A);

  it('drops scripts, handlers and inline styles, absolutizes images', () => {
    const out = clean('<img src="/pic.png" onerror="alert(1)" style="width:1px"><script>alert(1)</script>');
    expect(out).toBe('<img src="https://codeforces.com/pic.png">');
  });

  it('drops javascript: links and opens others in a new tab', () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe('<a target="_blank" rel="noopener noreferrer">x</a>');
    expect(clean('<a href="/blog/1">b</a>')).toContain('href="https://codeforces.com/blog/1"');
  });

  it('unwraps unknown tags but keeps their text', () => {
    expect(clean('<font color="red">hot</font>')).toBe('hot');
  });
});
