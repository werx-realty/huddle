'use client';
import { useEffect, useState } from 'react';
import { applyTheme, STAGES, THEMES } from '@/lib/client';

export function ThemePicker({ onClose }: { onClose?: () => void }) {
  const [theme, setTheme] = useState('dark');
  const [stage, setStage] = useState('');
  useEffect(() => {
    setTheme(localStorage.getItem('huddle-theme') || 'dark');
    setStage(localStorage.getItem('huddle-stage') || '');
  }, []);
  return (
    <div className="popover theme-pop" onClick={(e) => e.stopPropagation()}>
      <div className="pop-head">
        <span>App color</span>
        {onClose && (
          <button className="icon-btn sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={'theme-opt' + (theme === t.id ? ' on' : '')}
            onClick={() => {
              setTheme(t.id);
              applyTheme(t.id, stage);
            }}
          >
            <span className="sw" style={{ background: t.swatch }} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="pop-sub">Workspace background</div>
      <div className="stage-grid">
        {STAGES.map((s) => (
          <button
            key={s.id}
            title={s.label}
            className={'stage-opt' + (stage === s.value ? ' on' : '')}
            onClick={() => {
              setStage(s.value);
              applyTheme(theme, s.value);
            }}
          >
            <span className="sw" style={{ background: s.value || 'linear-gradient(135deg,var(--bg) 50%,var(--panel) 50%)' }} />
            <small>{s.label}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
