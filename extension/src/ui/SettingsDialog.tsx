import { Check, Keyboard, Palette, SlidersHorizontal, Timer as TimerIcon, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { Settings } from './state';
import type { ThemeDef } from './themes';
import { THEMES } from './themes';
import { Kbd, Modal } from './primitives';

type Section = 'appearance' | 'editor' | 'practice' | 'shortcuts';

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'editor', label: 'Editor', icon: <SlidersHorizontal size={16} /> },
  { id: 'practice', label: 'Practice', icon: <TimerIcon size={16} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
];

export const FONT_MIN = 11;
export const FONT_MAX = 26;

/** A tiny, theme-coloured code sample so each theme can be judged at a glance. */
function ThemePreview({ t }: { t: ThemeDef }) {
  const k = { color: t.keyword, fontWeight: t.boldKeywords ? 700 : 400 };
  return (
    <pre className="theme-preview" style={{ background: t.bg, color: t.fg }}>
      <span style={{ color: t.directive }}>#include</span> <span style={{ color: t.string }}>&lt;vector&gt;</span>
      {'\n'}
      <span style={k}>int</span> solve(<span style={{ color: t.type }}>vector</span>&lt;<span style={k}>int</span>&gt;& a) {'{'}
      {'\n'}
      {'  '}
      <span style={{ color: t.comment, fontStyle: t.italicComments ? 'italic' : 'normal' }}>// greedy</span>
      {'\n'}
      {'  '}
      <span style={k}>return</span> a.size() * <span style={{ color: t.number }}>42</span>;{'\n'}
      {'}'}
    </pre>
  );
}

function ThemeGrid({ themes, value, onPick }: { themes: ThemeDef[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="theme-grid">
      {themes.map((t) => (
        <button
          key={t.id}
          className={`theme-card ${value === t.id ? 'selected' : ''}`}
          onClick={() => onPick(t.id)}
          aria-pressed={value === t.id}
        >
          <ThemePreview t={t} />
          <span className="theme-name">
            <span className="theme-swatch" style={{ background: t.accent }} />
            {t.label}
            {value === t.id && <Check size={14} className="theme-check" />}
          </span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="pref-row">
      <span className="pref-text">
        <span className="pref-label">{label}</span>
        {hint && <span className="pref-hint">{hint}</span>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsDialog({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>('appearance');
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });

  return (
    <Modal wide title="Settings" onClose={onClose}>
      <div className="prefs">
        <nav className="prefs-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>
              {s.icon}
              {s.label}
            </button>
          ))}
        </nav>

        <div className="prefs-body">
          {section === 'appearance' && (
            <>
              <div className="pref-block">
                <div className="pref-head">
                  <Type size={16} />
                  <div>
                    <h3>Font size</h3>
                    <p>Applies to the code editor.</p>
                  </div>
                  <span className="font-value">{settings.fontSize}px</span>
                </div>
                <div className="font-control">
                  <button className="step" onClick={() => set('fontSize', Math.max(FONT_MIN, settings.fontSize - 1))} aria-label="Smaller">
                    A
                  </button>
                  <input
                    type="range"
                    min={FONT_MIN}
                    max={FONT_MAX}
                    value={settings.fontSize}
                    onChange={(e) => set('fontSize', Number(e.target.value))}
                    style={{ ['--fill' as string]: `${((settings.fontSize - FONT_MIN) / (FONT_MAX - FONT_MIN)) * 100}%` }}
                  />
                  <button className="step big" onClick={() => set('fontSize', Math.min(FONT_MAX, settings.fontSize + 1))} aria-label="Larger">
                    A
                  </button>
                </div>
                <div className="font-sample" style={{ fontSize: settings.fontSize }}>
                  for (int i = 0; i &lt; n; ++i) ans += a[i];
                </div>
              </div>

              <div className="pref-block">
                <div className="pref-head">
                  <Palette size={16} />
                  <div>
                    <h3>Theme</h3>
                    <p>Colours the editor and the whole workspace.</p>
                  </div>
                </div>
                <div className="theme-group-title">Dark</div>
                <ThemeGrid themes={THEMES.filter((t) => t.dark)} value={settings.theme} onPick={(id) => set('theme', id)} />
                <div className="theme-group-title">Light</div>
                <ThemeGrid themes={THEMES.filter((t) => !t.dark)} value={settings.theme} onPick={(id) => set('theme', id)} />
              </div>
            </>
          )}

          {section === 'editor' && (
            <div className="pref-block">
              <div className="pref-row">
                <span className="pref-text">
                  <span className="pref-label">Tab size</span>
                  <span className="pref-hint">Also used when formatting</span>
                </span>
                <div className="segmented">
                  {[2, 4, 8].map((n) => (
                    <button key={n} className={settings.tabSize === n ? 'active' : ''} onClick={() => set('tabSize', n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <Toggle label="Minimap" hint="Code overview on the right edge" checked={settings.minimap} onChange={(v) => set('minimap', v)} />
              <Toggle label="Word wrap" checked={settings.wordWrap} onChange={(v) => set('wordWrap', v)} />
              <Toggle
                label="Font ligatures"
                hint="Draws operators like != and >= as single symbols"
                checked={settings.ligatures}
                onChange={(v) => set('ligatures', v)}
              />
            </div>
          )}

          {section === 'practice' && (
            <div className="pref-block">
              <Toggle
                label="Start the timer when I start typing"
                hint="Otherwise start it from the top bar"
                checked={settings.autoStartTimer}
                onChange={(v) => set('autoStartTimer', v)}
              />
              <Toggle
                label="Always show tags and rating"
                hint="Hidden by default so they don't hint at the solution"
                checked={settings.showTags}
                onChange={(v) => set('showTags', v)}
              />
            </div>
          )}

          {section === 'shortcuts' && (
            <div className="pref-block">
              <dl className="shortcut-list">
                {[
                  ['Run all tests', "Ctrl+'"],
                  ['Submit (asks to confirm)', 'Ctrl+Enter'],
                  ['Format code', 'Shift+Alt+F'],
                  ['Show / hide statement', 'Ctrl+B'],
                  ['Focus mode (full screen)', 'Ctrl+Shift+F'],
                  ['Settings', 'Ctrl+,'],
                  ['Command palette', 'F1'],
                  ['Find / replace', 'Ctrl+F / Ctrl+H'],
                  ['Multi-cursor at next match', 'Ctrl+D'],
                ].map(([label, keys]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {keys.split(' / ').map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
