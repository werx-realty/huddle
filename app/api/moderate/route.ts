import { TrackSource } from 'livekit-server-sdk';
import { clean, isHost, json, parseMeta, roomService } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const room = clean(body.room, 80);
    const action = clean(body.action, 20);
    const identity = clean(body.identity, 64);
    if (!isHost(room, body.hostKey)) return json({ error: 'Only the host can do that.' }, 403);
    const svc = roomService();

    switch (action) {
      case 'mute': {
        const p = await svc.getParticipant(room, identity);
        const mic = p.tracks.find((t) => t.source === TrackSource.MICROPHONE);
        if (mic && !mic.muted) await svc.mutePublishedTrack(room, identity, mic.sid, true);
        return json({ ok: true });
      }
      case 'muteall': {
        const people = await svc.listParticipants(room);
        await Promise.all(
          people.flatMap((p) =>
            p.identity === identity
              ? []
              : p.tracks
                  .filter((t) => t.source === TrackSource.MICROPHONE && !t.muted)
                  .map((t) => svc.mutePublishedTrack(room, p.identity, t.sid, true)),
          ),
        );
        return json({ ok: true });
      }
      case 'allow-share':
      case 'revoke-share': {
        const sources = action === 'allow-share'
          ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
          : [TrackSource.CAMERA, TrackSource.MICROPHONE];
        await svc.updateParticipant(room, identity, undefined, {
          canSubscribe: true,
          canPublish: true,
          canPublishData: true,
          canUpdateMetadata: true,
          canPublishSources: sources,
        });
        return json({ ok: true });
      }
      case 'remove':
        await svc.removeParticipant(room, identity);
        return json({ ok: true });
      case 'lock':
      case 'unlock': {
        const [info] = await svc.listRooms([room]);
        if (!info) return json({ error: 'Session not found' }, 404);
        const meta = parseMeta(info.metadata);
        meta.locked = action === 'lock';
        await svc.updateRoomMetadata(room, JSON.stringify(meta));
        return json({ ok: true, locked: meta.locked });
      }
      case 'end':
        await svc.deleteRoom(room);
        return json({ ok: true });
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message || 'Action failed' }, 500);
  }
}
