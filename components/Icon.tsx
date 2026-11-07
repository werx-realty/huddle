import React from 'react';

const P: Record<string, React.ReactNode> = {
  mic: (<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><path d="M12 18v4" /></>),
  micOff: (<><path d="M2 2l20 20" /><path d="M9 9v2a3 3 0 0 0 5.12 2.12" /><path d="M15 9.34V5a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 11v-1" /><path d="M19 10v1a7 7 0 0 1-.11 1.23" /><path d="M12 18v4" /></>),
  cam: (<><path d="M15 10l5-3v10l-5-3" /><rect x="2" y="6" width="13" height="12" rx="2.5" /></>),
  camOff: (<><path d="M2 2l20 20" /><path d="M15 10l5-3v10l-1.5-.9" /><path d="M10.5 6H13a2 2 0 0 1 2 2v2.5" /><path d="M15 15.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h.5" /></>),
  screen: (<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M9 10l3-3 3 3M12 7v6" /></>),
  chat: (<><path d="M21 12a8 8 0 0 1-11.6 7.14L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>),
  bolt: (<><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></>),
  hand: (<><path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v6" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></>),
  smile: (<><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></>),
  leave: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>),
  palette: (<><circle cx="13.5" cy="6.5" r="1" /><circle cx="17.5" cy="10.5" r="1" /><circle cx="8.5" cy="7.5" r="1" /><circle cx="6.5" cy="12.5" r="1" /><path d="M12 2a10 10 0 0 0 0 20c.93 0 1.5-.75 1.5-1.5 0-.4-.15-.75-.4-1.03-.25-.28-.4-.63-.4-1.03A1.5 1.5 0 0 1 14.2 17H16a6 6 0 0 0 6-6c0-4.97-4.48-9-10-9z" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  unlock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.9-1" /></>),
  x: (<><path d="M18 6L6 18M6 6l12 12" /></>),
  send: (<><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  check: (<><path d="M20 6L9 17l-5-5" /></>),
  more: (<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>),
  remove: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 9l4 4M21 9l-4 4" /></>),
  power: (<><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><path d="M12 2v10" /></>),
  chevL: (<><path d="M15 18l-6-6 6-6" /></>),
  chevR: (<><path d="M9 18l6-6-6-6" /></>),
  question: (<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>),
  wifi: (<><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><path d="M12 19.5h.01" /><path d="M1.5 9a15 15 0 0 1 21 0" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  refresh: (<><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></>),
};

export function Icon({ name, size = 20, stroke = 1.9, className }: { name: keyof typeof P | string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <circle cx="11" cy="12.5" r="3.2" fill="#fff" />
      <circle cx="21" cy="12.5" r="3.2" fill="#fff" opacity=".75" />
      <path d="M5.5 24c.8-3.6 3-5.6 5.5-5.6s4.7 2 5.5 5.6M15.5 24c.8-3.6 3-5.6 5.5-5.6s4.7 2 5.5 5.6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
