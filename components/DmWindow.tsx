'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type Msg = { id: string; from: string; name: string; text: string; ts: number; to?: string };

export function DmWindow({ peer, me, msgs, onSend, onClose }: {
  peer: { id: string; name: string };
  me: string;
  msgs: Msg[];
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 760), y: Math.max(70, window.innerHeight - 520) }));
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const thread = msgs.filter((m) => m.to && ((m.from === me && m.to === peer.id) || (m.from === peer.id && m.to === me)));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [peer.id]);

  function drag(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const sx = e.clientX - pos.x;
    const sy = e.clientY - pos.y;
    setDragging(true);
    const move = (ev: PointerEvent) =>
      setPos({ x: Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - sx)), y: Math.max(0, Math.min(window.innerHeight - 50, ev.clientY - sy)) });
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function submit() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <div className={'dm-win' + (dragging ? ' dragging' : '')} style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
      <div className="dm-head" onPointerDown={drag}>
        <Icon name="lock" size={13} />
        <span>Private chat · <b>{peer.name}</b></span>
        <button className="icon-btn xs" onClick={onClose} aria-label="Close chat"><Icon name="x" size={15} /></button>
      </div>
      <div className="dm-list" ref={listRef}>
        {thread.length === 0 && <div className="dm-empty">Only you and {peer.name.split(' ')[0]} can see this.</div>}
        {thread.map((m) => (
          <div key={m.id} className={'dm-msg' + (m.from === me ? ' mine' : '')}>
            <span>{m.text}</span>
            <small>{new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
          </div>
        ))}
      </div>
      <div className="dm-input">
        <input
          ref={inputRef}
          value={text}
          placeholder={`Message ${peer.name.split(' ')[0]}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          maxLength={1000}
        />
        <button className="send" onClick={submit} disabled={!text.trim()} aria-label="Send"><Icon name="send" size={16} /></button>
      </div>
    </div>
  );
}
