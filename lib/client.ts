'use client';

export type Profile = {
  identity: string;
  name: string;
  team: string;
  avatar: string;
  camOn: boolean;
};

const PROFILE_KEY = 'huddle-profile';

export function loadProfile(): Profile {
  let p: Partial<Profile> = {};
  try {
    p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
  } catch {}
  if (!p.identity) {
    p.identity = 'agent-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  return {
    identity: p.identity!,
    name: p.name || '',
    team: p.team || '',
    avatar: p.avatar || '',
    camOn: p.camOn !== false,
  };
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {}
}

export function getHostKey(room: string) {
  try {
    return localStorage.getItem('huddle-host:' + room) || '';
  } catch {
    return '';
  }
}
export function setHostKey(room: string, key: string) {
  try {
    localStorage.setItem('huddle-host:' + room, key);
  } catch {}
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = ['#3b6fd8', '#6a5acd', '#c2185b', '#d9822b', '#0f8fa8', '#8e44ad', '#2c5aa0', '#b5485d', '#5c6bc0', '#7a5c3a'];
export function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export const STATUSES = {
  help: { label: 'Need Help', emoji: '🙋', color: '#ef5350', ttl: 0 },
  lead: { label: 'Got a Lead', emoji: '🔥', color: '#f5a623', ttl: 90_000 },
  question: { label: 'Quick Question', emoji: '❓', color: '#9b7bff', ttl: 120_000 },
  win: { label: 'Share a Win', emoji: '🏆', color: '#3d8bff', ttl: 90_000 },
  break: { label: 'Taking a Break', emoji: '☕', color: '#8a94a6', ttl: 0 },
} as const;
export type StatusKey = keyof typeof STATUSES;

export function activeStatus(attrs: Record<string, string> | undefined): StatusKey | null {
  const s = attrs?.status as StatusKey | undefined;
  if (!s || !(s in STATUSES)) return null;
  const ttl = STATUSES[s].ttl;
  const at = Number(attrs?.statusAt || 0);
  if (ttl && Date.now() - at > ttl) return null;
  return s;
}

export const THEMES = [
  { id: 'darker', label: 'Darker', swatch: '#07080a' },
  { id: 'dark', label: 'Dark', swatch: '#121419' },
  { id: 'grey', label: 'Grey', swatch: '#2a2d33' },
  { id: 'white', label: 'White', swatch: '#f4f5f7' },
] as const;

export const STAGES = [
  { id: 'default', label: 'Theme', value: '' },
  { id: 'black', label: 'Black', value: '#000000' },
  { id: 'charcoal', label: 'Charcoal', value: '#16181d' },
  { id: 'slate', label: 'Slate', value: '#232833' },
  { id: 'navy', label: 'Navy', value: '#0c1626' },
  { id: 'steel', label: 'Steel', value: '#3a4150' },
  { id: 'cloud', label: 'Cloud', value: '#e6e8ec' },
] as const;

export function applyTheme(theme?: string, stage?: string) {
  const t = theme ?? (localStorage.getItem('huddle-theme') || 'dark');
  const s = stage ?? (localStorage.getItem('huddle-stage') || '');
  document.documentElement.dataset.theme = t;
  if (s) document.documentElement.style.setProperty('--stage', s);
  else document.documentElement.style.removeProperty('--stage');
  localStorage.setItem('huddle-theme', t);
  localStorage.setItem('huddle-stage', s);
}

export function makeAvatar(src: string, mode: 'fit' | 'fill'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 112;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#1b1e24';
      ctx.fillRect(0, 0, size, size);
      const scale = mode === 'fit' ? Math.min(size / img.width, size / img.height) : Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = reject;
    img.src = src;
  });
}
