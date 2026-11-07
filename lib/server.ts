import { createHmac, timingSafeEqual } from 'crypto';
import { RoomServiceClient } from 'livekit-server-sdk';

export function env() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) {
    throw new Error('Missing LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET environment variables.');
  }
  return { url, key, secret };
}

export function roomService() {
  const { url, key, secret } = env();
  const http = url.replace(/^ws/, 'http');
  return new RoomServiceClient(http, key, secret);
}

/** Host key = HMAC of the room name. Stateless: whoever created the room holds it. */
export function hostKeyFor(room: string) {
  return createHmac('sha256', env().secret).update('host:' + room).digest('hex').slice(0, 32);
}

export function isHost(room: string, key?: string | null) {
  if (!key) return false;
  const a = Buffer.from(hostKeyFor(room));
  const b = Buffer.from(String(key));
  return a.length === b.length && timingSafeEqual(a, b);
}

export type RoomMeta = {
  title: string;
  host: string;
  createdAt: number;
  locked: boolean;
  max: number;
};

export function parseMeta(raw?: string): RoomMeta {
  try {
    const m = JSON.parse(raw || '{}');
    return {
      title: m.title || 'Calling Session',
      host: m.host || '',
      createdAt: m.createdAt || Date.now(),
      locked: !!m.locked,
      max: m.max || 50,
    };
  } catch {
    return { title: 'Calling Session', host: '', createdAt: Date.now(), locked: false, max: 50 };
  }
}

export function clean(s: unknown, max = 60) {
  return String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
