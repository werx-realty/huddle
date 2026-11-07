import { randomBytes } from 'crypto';
import { clean, hostKeyFor, json, parseMeta, roomService } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rooms = await roomService().listRooms();
    const list = rooms
      .map((r) => {
        const meta = parseMeta(r.metadata);
        return {
          name: r.name,
          title: meta.title,
          host: meta.host,
          locked: meta.locked,
          max: meta.max,
          createdAt: meta.createdAt,
          participants: r.numParticipants,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    return json({ rooms: list });
  } catch (e: any) {
    return json({ error: e?.message || 'Could not reach video server' }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = clean(body.title, 80) || 'Calling Session';
    const host = clean(body.host, 40) || 'Team Leader';
    const max = Math.min(100, Math.max(2, parseInt(body.max, 10) || 50));
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'session';
    const name = `${slug}-${randomBytes(3).toString('hex')}`;
    await roomService().createRoom({
      name,
      maxParticipants: max,
      emptyTimeout: 30 * 60, // keep an empty room open 30 min so people can come back
      departureTimeout: 15 * 60,
      metadata: JSON.stringify({ title, host, createdAt: Date.now(), locked: false, max }),
    });
    return json({ name, hostKey: hostKeyFor(name) });
  } catch (e: any) {
    return json({ error: e?.message || 'Could not create session' }, 500);
  }
}
