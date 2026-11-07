import { AccessToken } from 'livekit-server-sdk';
import { clean, env, isHost, json, parseMeta, roomService } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const room = clean(body.room, 80);
    const name = clean(body.name, 40);
    const team = clean(body.team, 40);
    const identity = clean(body.identity, 64);
    if (!room || !name || !identity) return json({ error: 'Name and session are required.' }, 400);

    const svc = roomService();
    const [info] = await svc.listRooms([room]);
    if (!info) return json({ error: 'This session has ended or does not exist.', code: 'ended' }, 404);

    const meta = parseMeta(info.metadata);
    const host = isHost(room, body.hostKey);

    let alreadyIn = false;
    if (!host && (meta.locked || info.numParticipants >= meta.max)) {
      const people = await svc.listParticipants(room);
      alreadyIn = people.some((p) => p.identity === identity); // page refresh / reconnect
    }
    if (!host && meta.locked && !alreadyIn) {
      return json({ error: 'This session is locked by the host.', code: 'locked' }, 423);
    }
    if (!host && !alreadyIn && info.numParticipants >= meta.max) {
      return json({ error: 'This session is full.', code: 'full' }, 409);
    }

    const { key, secret, url } = env();
    const at = new AccessToken(key, secret, { identity, name, ttl: '8h' });
    at.attributes = { team, role: host ? 'host' : 'agent' };
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });
    return json({ token: await at.toJwt(), url, host, meta });
  } catch (e: any) {
    return json({ error: e?.message || 'Could not join session' }, 500);
  }
}
