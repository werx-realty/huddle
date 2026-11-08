'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/* ---- tiny IndexedDB store: the agent's script PDF stays in their own browser ---- */
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('huddle', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveFile(key: string, val: { name: string; blob: Blob } | null) {
  const d = await db();
  return new Promise<void>((res) => {
    const tx = d.transaction('files', 'readwrite');
    if (val) tx.objectStore('files').put(val, key);
    else tx.objectStore('files').delete(key);
    tx.oncomplete = () => res();
  });
}
async function loadFile(key: string): Promise<{ name: string; blob: Blob } | null> {
  const d = await db();
  return new Promise((res) => {
    const r = d.transaction('files').objectStore('files').get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
}

type Box = { x: number; y: number; w: number; h: number };
const BOX_KEY = 'huddle-script-box';

export function ScriptPanel({ open, onClose, isAdmin, onShareAll, team, teamFocus }: {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onShareAll?: (blob: Blob, name: string) => Promise<void>;
  team?: { name: string; url: string } | null;
  teamFocus?: number;
}) {
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (teamFocus) setTab('team');
  }, [teamFocus]);
  const [loaded, setLoaded] = useState(false);
  const [fit, setFit] = useState<'width' | 'page'>('width');
  const [box, setBox] = useState<Box>(() => {
    try {
      const b = JSON.parse(localStorage.getItem(BOX_KEY) || '');
      if (b && b.w) return b;
    } catch {}
    return { x: 24, y: 80, w: 460, h: 600 };
  });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFile('script').then((f) => {
      if (f) {
        setFile({ name: f.name, url: URL.createObjectURL(f.blob) });
        setBlob(f.blob);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BOX_KEY, JSON.stringify(box));
    } catch {}
  }, [box]);

  // keep the window on screen if the browser is resized
  useEffect(() => {
    if (!open) return;
    const clamp = () =>
      setBox((b) => {
        const w = Math.min(b.w, window.innerWidth - 16);
        const h = Math.min(b.h, window.innerHeight - 16);
        return { w, h, x: Math.max(8, Math.min(b.x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(b.y, window.innerHeight - h - 8)) };
      });
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [open]);

  function pick(f?: File) {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      alert('Please choose a PDF file.');
      return;
    }
    if (file) URL.revokeObjectURL(file.url);
    setFile({ name: f.name, url: URL.createObjectURL(f) });
    setBlob(f);
    setTab('mine');
    saveFile('script', { name: f.name, blob: f });
  }

  function remove() {
    if (file) URL.revokeObjectURL(file.url);
    setFile(null);
    setBlob(null);
    saveFile('script', null);
  }

  function startDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
    if ((e.target as HTMLElement).closest('button') && mode === 'move') return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { ...box };
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (mode === 'move') {
        setBox({ ...start, x: Math.max(0, Math.min(window.innerWidth - 120, start.x + dx)), y: Math.max(0, Math.min(window.innerHeight - 50, start.y + dy)) });
      } else {
        setBox({ ...start, w: Math.max(280, Math.min(window.innerWidth - start.x - 8, start.w + dx)), h: Math.max(220, Math.min(window.innerHeight - start.y - 8, start.h + dy)) });
      }
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  if (!open) return null;
  const showTeam = tab === 'team' && team;
  const view = showTeam ? team : file;

  return (
    <div className={'script-win' + (dragging ? ' dragging' : '')} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onClick={(e) => e.stopPropagation()}>
      <div className="script-head" onPointerDown={(e) => startDrag(e, 'move')}>
        <Icon name="doc" size={16} />
        {team ? (
          <span className="script-tabs">
            <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My script</button>
            <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Team script</button>
          </span>
        ) : (
          <span className="script-title">{file ? file.name.replace(/\.pdf$/i, '') : 'My call script'}</span>
        )}
        {team && <span className="grow" />}
        {isAdmin && file && blob && tab === 'mine' && onShareAll && (
          <button
            className="btn primary xs"
            disabled={sending}
            title="Send this script to every agent in the room"
            onClick={async () => {
              setSending(true);
              try {
                await onShareAll(blob, file.name);
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? 'Sending…' : 'Send to all'}
          </button>
        )}
        {view && (
          <>
            <button className="btn ghost xs" onClick={() => setFit(fit === 'width' ? 'page' : 'width')} title="Fit the whole page in the window">
              {fit === 'width' ? 'Fit' : 'Fit width'}
            </button>
            {!showTeam && <button className="btn ghost xs" onClick={() => inputRef.current?.click()}>Replace</button>}
          </>
        )}
        <button className="icon-btn xs" onClick={onClose} aria-label="Close script"><Icon name="x" size={15} /></button>
      </div>
      <div className="script-body">
        {view ? (
          <iframe key={view.url + fit} src={`${view.url}#toolbar=0&navpanes=0&view=${fit === 'width' ? 'FitH' : 'Fit'}`} title="Call script" />
        ) : loaded ? (
          <div
            className="script-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            <Icon name="doc" size={34} />
            <b>Upload your cold call script</b>
            <small>PDF only. It stays private on this computer and opens here every time.</small>
            <button className="btn primary" onClick={() => inputRef.current?.click()}><Icon name="plus" size={16} /> Choose PDF</button>
          </div>
        ) : null}
      </div>
      {view && (
        <div className="script-foot">
          {showTeam ? <span>Shared by the admin</span> : <button className="script-remove" onClick={remove}>Remove script</button>}
          <span>Drag the top bar to move · drag the corner to resize</span>
        </div>
      )}
      <div className="script-resize" onPointerDown={(e) => startDrag(e, 'resize')} title="Drag to resize" />
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
