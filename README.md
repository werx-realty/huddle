# Huddle — Virtual Calling Floor

Live video calling floor for real estate agents. Next.js + LiveKit (real WebRTC video/audio).

## Environment variables (Vercel → Project → Settings → Environment Variables)

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```
Get these free at cloud.livekit.io → create project → Settings → Keys.

## Run locally

```
npm install
npm run dev
```

## What's built (Phase 2 + 3, no logins yet)
- Lobby: name, team, photo (with Fit), camera preview, live sessions list, start a session
- Video grid that resizes for 1–50+ agents, pages after 25 tiles
- Big mic button (join muted, tap to talk, hold Space = push-to-talk, M = toggle)
- Speaking glow, muted icons, camera-off avatars, network bars, auto-reconnect, refresh-safe
- Huddle Mode: Need Help / Got a Lead / Quick Question / Share a Win / Taking a Break, raise hand, emoji reactions
- Right-side chat: group + private messages, "Ask the group" questions with Mark answered, quick messages, emoji reactions
- Host: mute, mute everyone, remove, lock/unlock, end session, invite link
- 4 app themes + workspace background colors

## Next phases
Logins + Supabase (teams, brokerages, scheduling, recurring sessions, attendance reports, saved chat).
