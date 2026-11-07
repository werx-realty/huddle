'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  useConnectionQualityIndicator,
  useConnectionState,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantAttributes,
  useParticipants,
  useRoomContext,
  useRoomInfo,
  useTracks,
} from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-react';
import {
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
  Participant,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalAudioTrack,
} from 'livekit-client';
import { Icon, Logo } from './Icon';
import { ThemePicker } from './ThemePicker';
import { activeStatus, colorFor, fmtDuration, initials, Profile, setHostKey, STATUSES, StatusKey } from '@/lib/client';
import '@/app/private.css';

/* ---------------------------------- types --------------------------------- */
type ChatMsg = {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
  to?: string;
  toName?: string;
  q?: boolean;
  answered?: boolean;
  reacts?: Record<string, string[]>;
  kind?: 'win' | 'lead';
};
type Wire =
  | ({ t: 'msg' } & Omit<ChatMsg, 'reacts' | 'answered'>)
  | { t: 'react'; id: string; emoji: string; from: string }
  | { t: 'answered'; id: string }
  | { t: 'float'; emoji: string }
  | { t: 'pr-invite'; room: string }
  | { t: 'pr-yes'; room: string }
  | { t: 'pr-no'; room: string };
type Toast = { id: string; text: string; color?: string; emoji?: string };
type Float = { id: string; identity: string; emoji: string; x: number };

const enc = new TextEncoder();
const dec = new TextDecoder();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
const REACTIONS = ['👏', '🔥', '🎉', '👍', '😂', '💪'];
const MSG_REACTS = ['👍', '🔥', '👏', '✅', '😂'];
const QUICK_MSGS = ['📞 On a call', '🔁 Who wants to role-play?', '👏 Great job!', '⏱️ Back in 5'];

/* ------------------------------- outer shell ------------------------------ */
export function HuddleRoom(props: {
  roomName: string;
  token: string;
  url: string;
  isHost: boolean;
  hostKey: string;
  profile: Profile;
  backTo?: string;
  onExit: (reason?: string) => void;
}) {
  const room = useMemo(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: { width: 640, height: 360, frameRate: 15 } },
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [VideoPresets.h180],
          videoEncoding: { maxBitrate: 350_000, maxFramerate: 15 },
          dtx: true,
          red: true,
        },
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }),
    [],
  );

  return (
    <LiveKitRoom
      room={room}
      token={props.token}
      serverUrl={props.url}
      connect
      video={props.profile.camOn}
      audio={false}
      onConnected={async () => {
        // Publish the microphone already MUTED so unmuting is instant and nothing is ever sent by surprise.
        try {
          if (!room.localParticipant.getTrackPublication(Track.Source.Microphone)) {
            const mic = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
            await mic.mute();
            await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone, dtx: true, red: true });
          }
        } catch (e) {
          console.warn('mic publish failed', e);
        }
        try {
          if (props.profile.avatar) await room.localParticipant.setAttributes({ avatar: props.profile.avatar });
        } catch {}
      }}
      onDisconnected={(reason) => {
        if (reason === DisconnectReason.CLIENT_INITIATED) props.onExit();
        else if (reason === DisconnectReason.PARTICIPANT_REMOVED) props.onExit('You were removed from the session by the host.');
        else if (reason === DisconnectReason.ROOM_DELETED) props.onExit('The host ended this session.');
        else if (reason === DisconnectReason.DUPLICATE_IDENTITY) props.onExit('You joined this session in another tab or window.');
        else props.onExit('__lost__');
      }}
      onError={(e) => console.warn(e)}
      className="room-root"
    >
      <RoomView {...props} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

/* -------------------------------- main view ------------------------------- */
function RoomView({ roomName, isHost, hostKey, backTo }: { roomName: string; isHost: boolean; hostKey: string; profile: Profile; backTo?: string }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const conn = useConnectionState();
  const info = useRoomInfo();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false }) as TrackReference[];

  const meta = useMemo(() => {
    try {
      return JSON.parse(info.metadata || '{}');
    } catch {
      return {};
    }
  }, [info.metadata]);

  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<'chat' | 'people' | null>(null);
  const [pop, setPop] = useState<'huddle' | 'react' | 'theme' | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [composeMode, setComposeMode] = useState<{ q?: boolean; prefill?: string; n: number }>({ n: 0 });
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const [invite, setInvite] = useState<{ from: string; name: string; room: string } | null>(null);
  const [pending, setPending] = useState<{ to: string; name: string; room: string } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const inPrivate = !!backTo;
  const goPrivate = useCallback(
    (r: string) => {
      (window as any).__huddleNav = true;
      window.location.assign('/room/' + encodeURIComponent(r) + '?back=' + encodeURIComponent(roomName));
    },
    [roomName],
  );

  // open chat on the right by default on wide screens
  useEffect(() => {
    if (window.innerWidth >= 1100) setPanel('chat');
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid();
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4500);
  }, []);

  const send = useCallback(
    (w: Wire, to?: string) => {
      room.localParticipant
        .publishData(enc.encode(JSON.stringify(w)), { reliable: true, topic: 'huddle', destinationIdentities: to ? [to] : undefined })
        .catch(() => {});
    },
    [room],
  );

  const addFloat = useCallback((identity: string, emoji: string) => {
    const id = uid();
    setFloats((f) => [...f, { id, identity, emoji, x: 20 + Math.random() * 60 }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 2800);
  }, []);

  /* --------------------------- room event wiring --------------------------- */
  useEffect(() => {
    const onData = (payload: Uint8Array, p?: Participant, _k?: unknown, topic?: string) => {
      if (topic !== 'huddle' || !p) return;
      let w: Wire;
      try {
        w = JSON.parse(dec.decode(payload));
      } catch {
        return;
      }
      if (w.t === 'msg') {
        const m: ChatMsg = { id: w.id, from: p.identity, name: p.name || 'Agent', text: String(w.text).slice(0, 1000), ts: w.ts, to: w.to, toName: w.toName, q: w.q, kind: w.kind };
        setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
        if (panelRef.current !== 'chat') setUnread((u) => u + 1);
        if (m.to) toast({ text: `Private message from ${m.name}`, emoji: '✉️' });
        else if (m.q && panelRef.current !== 'chat') toast({ text: `${m.name} asked a question`, emoji: '❓', color: STATUSES.question.color });
      } else if (w.t === 'react') {
        setMsgs((x) => x.map((m) => (m.id === w.id ? toggleReact(m, w.emoji, p.identity) : m)));
      } else if (w.t === 'answered') {
        setMsgs((x) => x.map((m) => (m.id === w.id ? { ...m, answered: true } : m)));
      } else if (w.t === 'float') {
        if (REACTIONS.includes(w.emoji)) addFloat(p.identity, w.emoji);
      } else if (w.t === 'pr-invite') {
        if (/^private-[a-f0-9]+$/.test(w.room)) setInvite({ from: p.identity, name: p.name || 'An agent', room: w.room });
      } else if (w.t === 'pr-yes') {
        if (pendingRef.current?.room === w.room) goPrivate(w.room);
      } else if (w.t === 'pr-no') {
        if (pendingRef.current?.room === w.room) {
          setPending(null);
          toast({ text: `${p.name} can't right now`, emoji: '🕑' });
        }
      }
    };
    const onAttrs = (changed: Record<string, string>, p: Participant) => {
      if (p.isLocal) return;
      if ('status' in changed && changed.status) {
        const s = STATUSES[changed.status as StatusKey];
        if (s && (changed.status !== 'break' || isHost)) toast({ text: `${p.name} — ${s.label}`, emoji: s.emoji, color: s.color });
      }
      if ('hand' in changed && changed.hand === '1') toast({ text: `${p.name} raised their hand`, emoji: '✋' });
    };
    const onJoin = (p: Participant) => toast({ text: `${p.name || 'Someone'} joined`, emoji: '👋' });
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttrs);
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttrs);
      room.off(RoomEvent.ParticipantConnected, onJoin);
    };
  }, [room, toast, addFloat, isHost, goPrivate]);

  // Detect host-forced mute: mic went muted without us asking.
  const selfMute = useRef(false);
  const prevMic = useRef(isMicrophoneEnabled);
  useEffect(() => {
    if (prevMic.current && !isMicrophoneEnabled && !selfMute.current) toast({ text: 'The host muted your microphone', emoji: '🔇' });
    prevMic.current = isMicrophoneEnabled;
    selfMute.current = false;
  }, [isMicrophoneEnabled, toast]);

  /* ------------------------------- controls ------------------------------- */
  const micBusy = useRef(false);
  const setMic = useCallback(
    async (on: boolean) => {
      if (micBusy.current) return;
      micBusy.current = true;
      try {
        if (!on) selfMute.current = true;
        await localParticipant.setMicrophoneEnabled(on);
      } catch {
        toast({ text: 'Microphone blocked — allow mic access in your browser', emoji: '⚠️', color: '#ef5350' });
      } finally {
        micBusy.current = false;
      }
    },
    [localParticipant, toast],
  );
  const micOnRef = useRef(isMicrophoneEnabled);
  micOnRef.current = isMicrophoneEnabled;

  // Keyboard: M toggles mic, V toggles camera, hold Space = push-to-talk
  useEffect(() => {
    let ptt = false;
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat && !micOnRef.current) {
          ptt = true;
          setMic(true);
        }
      } else if (e.key === 'm' || e.key === 'M') setMic(!micOnRef.current);
      else if (e.key === 'v' || e.key === 'V') localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled).catch(() => {});
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && ptt) {
        ptt = false;
        setMic(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [setMic, localParticipant]);

  const myAttrs = localParticipant.attributes || {};
  const myStatus = activeStatus(myAttrs);
  const handUp = myAttrs.hand === '1';

  // clear my own expired status
  useEffect(() => {
    if (myAttrs.status && !myStatus) localParticipant.setAttributes({ status: '', statusAt: '' }).catch(() => {});
  }, [now]); // eslint-disable-line

  function setStatus(k: StatusKey) {
    const clear = myStatus === k;
    localParticipant.setAttributes({ status: clear ? '' : k, statusAt: String(Date.now()) }).catch(() => {});
    setPop(null);
    if (clear) return;
    if (k === 'question') {
      setPanel('chat');
      setComposeMode((c) => ({ q: true, prefill: '', n: c.n + 1 }));
    } else if (k === 'win') {
      setPanel('chat');
      setComposeMode((c) => ({ q: false, prefill: '🏆 Win: ', n: c.n + 1 }));
    } else if (k === 'lead') {
      postMsg({ text: '🔥 Just got a lead!', kind: 'lead' });
    }
  }

  function postMsg(m: { text: string; to?: string; toName?: string; q?: boolean; kind?: 'win' | 'lead' }) {
    const text = m.text.trim();
    if (!text) return;
    const msg: ChatMsg = { id: uid(), from: localParticipant.identity, name: localParticipant.name || 'Me', text, ts: Date.now(), to: m.to, toName: m.toName, q: m.q, kind: m.kind };
    setMsgs((x) => [...x, msg]);
    send({ t: 'msg', id: msg.id, from: msg.from, name: msg.name, text, ts: msg.ts, to: m.to, toName: m.toName, q: m.q, kind: m.kind }, m.to);
  }

  function reactMsg(id: string, emoji: string) {
    setMsgs((x) => x.map((m) => (m.id === id ? toggleReact(m, emoji, localParticipant.identity) : m)));
    const m = msgs.find((y) => y.id === id);
    send({ t: 'react', id, emoji, from: localParticipant.identity }, m?.to ? (m.from === localParticipant.identity ? m.to : m.from) : undefined);
  }
  function answerMsg(id: string) {
    setMsgs((x) => x.map((m) => (m.id === id ? { ...m, answered: true } : m)));
    send({ t: 'answered', id });
  }
  function floatReact(emoji: string) {
    addFloat(localParticipant.identity, emoji);
    send({ t: 'float', emoji });
    setPop(null);
  }

  async function moderate(action: string, identity?: string) {
    try {
      const r = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room: roomName, hostKey, action, identity: identity || localParticipant.identity }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (action === 'lock') toast({ text: 'Session locked — no new agents can join', emoji: '🔒' });
      if (action === 'unlock') toast({ text: 'Session unlocked', emoji: '🔓' });
      if (action === 'muteall') toast({ text: 'Everyone else was muted', emoji: '🔇' });
    } catch (e: any) {
      toast({ text: e.message || 'Action failed', emoji: '⚠️', color: '#ef5350' });
    }
  }

  async function startPrivate(p: Participant) {
    if (pending) return;
    try {
      const r = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: `Private room: ${localParticipant.name} & ${p.name}`, host: localParticipant.name, private: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setHostKey(d.name, d.hostKey);
      setPending({ to: p.identity, name: p.name || 'agent', room: d.name });
      send({ t: 'pr-invite', room: d.name }, p.identity);
      setTimeout(() => {
        if (pendingRef.current?.room === d.name) {
          setPending(null);
          toast({ text: `${p.name} didn't answer`, emoji: '🕑' });
        }
      }, 45000);
    } catch (e: any) {
      toast({ text: e.message || 'Could not open a private room', emoji: '⚠️', color: '#ef5350' });
    }
  }
  function answerInvite(yes: boolean) {
    if (!invite) return;
    send({ t: yes ? 'pr-yes' : 'pr-no', room: invite.room }, invite.from);
    const r = invite.room;
    setInvite(null);
    if (yes) setTimeout(() => goPrivate(r), 150);
  }

  function copyInvite() {
    const link = `${location.origin}/?join=${encodeURIComponent(roomName)}`;
    navigator.clipboard?.writeText(link).then(
      () => toast({ text: 'Invite link copied', emoji: '🔗' }),
      () => toast({ text: link }),
    );
  }

  useEffect(() => {
    if (panel === 'chat') setUnread(0);
  }, [panel, msgs.length]);

  /* ------------------------------- ordering ------------------------------- */
  const ordered = useMemo(() => {
    const local = participants.filter((p) => p.isLocal);
    const remote = participants.filter((p) => !p.isLocal).sort((a, b) => (a.joinedAt?.getTime() || 0) - (b.joinedAt?.getTime() || 0));
    return [...local, ...remote];
  }, [participants]);

  const share = screenTracks.find((t) => t.publication);
  const count = participants.length;
  const locked = !!meta.locked;
  const createdAt = meta.createdAt || now;
  const unanswered = msgs.filter((m) => m.q && !m.answered).length;

  return (
    <div className={'room' + (panel ? ' with-panel' : '')} onClick={() => setPop(null)}>
      {/* top bar */}
      <header className="room-top">
        <div className="rt-left">
          <Logo size={26} />
          <div className="rt-title">
            <b>{inPrivate ? '🔒 Private room' : meta.title || 'Calling Session'}</b>
            <span>
              <span className="dot-live" /> Live {fmtDuration(now - createdAt)} · {count} {count === 1 ? 'agent' : 'agents'}
              {meta.host ? ` · Host: ${meta.host}` : ''}
            </span>
          </div>
          {locked && <span className="tag"><Icon name="lock" size={12} /> Locked</span>}
        </div>
        <div className="rt-right">
          <ConnBadge state={conn} />
          {inPrivate ? (
            <button className="btn primary sm" onClick={() => room.disconnect()}><Icon name="leave" size={15} /> Back to floor</button>
          ) : (
            <button className="btn ghost sm" onClick={copyInvite}><Icon name="copy" size={15} /> Invite</button>
          )}
          {isHost && !inPrivate && (
            <>
              <button className="btn ghost sm" onClick={() => moderate(locked ? 'unlock' : 'lock')}>
                <Icon name={locked ? 'unlock' : 'lock'} size={15} /> {locked ? 'Unlock' : 'Lock'}
              </button>
              <button className="btn danger sm" onClick={() => setConfirmEnd(true)}><Icon name="power" size={15} /> End session</button>
            </>
          )}
        </div>
      </header>

      {conn === ConnectionState.Reconnecting && (
        <div className="reconnect-bar"><span className="spinner" /> Connection dropped — reconnecting your audio and video…</div>
      )}

      <div className="room-body">
        <Stage participants={ordered} share={share} floats={floats} now={now} isHost={isHost && !inPrivate} onModerate={moderate} onPrivate={inPrivate ? undefined : startPrivate} />
        {panel && (
          <aside className="side" onClick={(e) => e.stopPropagation()}>
            <div className="side-tabs">
              <button className={panel === 'chat' ? 'on' : ''} onClick={() => setPanel('chat')}>
                Chat {unanswered > 0 && <span className="badge q" title="Open questions">{unanswered}</span>}
              </button>
              <button className={panel === 'people' ? 'on' : ''} onClick={() => setPanel('people')}>People <span className="badge">{count}</span></button>
              <button className="icon-btn sm close" onClick={() => setPanel(null)} aria-label="Close panel"><Icon name="x" size={16} /></button>
            </div>
            {panel === 'chat' ? (
              <ChatPanel
                msgs={msgs}
                me={localParticipant.identity}
                people={ordered.filter((p) => !p.isLocal)}
                onSend={postMsg}
                onReact={reactMsg}
                onAnswer={answerMsg}
                mode={composeMode}
              />
            ) : (
              <PeoplePanel people={ordered} isHost={isHost && !inPrivate} onModerate={moderate} now={now} onPrivate={inPrivate ? undefined : startPrivate} />
            )}
          </aside>
        )}
      </div>

      {/* toolbar */}
      <footer className="toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="tb-side tb-left">
          <div className="tb-hint">
            <kbd>Space</kbd> hold to talk · <kbd>M</kbd> mute
          </div>
        </div>
        <div className="tb-center">
          <button className={'mic-btn ' + (isMicrophoneEnabled ? 'live' : 'muted')} onClick={() => setMic(!isMicrophoneEnabled)} aria-pressed={isMicrophoneEnabled}>
            <span className="mic-ic"><Icon name={isMicrophoneEnabled ? 'mic' : 'micOff'} size={24} /></span>
            <span className="mic-txt">
              <b>{isMicrophoneEnabled ? 'Mic is LIVE' : 'Muted'}</b>
              <small>{isMicrophoneEnabled ? 'Everyone hears you · tap to mute' : 'Tap to unmute & talk'}</small>
            </span>
          </button>
          <ToolBtn icon={isCameraEnabled ? 'cam' : 'camOff'} label="Camera" off={!isCameraEnabled} onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled).catch(() => toast({ text: 'Camera blocked or not found', emoji: '⚠️' }))} />
          <ToolBtn icon="screen" label={isScreenShareEnabled ? 'Stop share' : 'Share'} active={isScreenShareEnabled} onClick={() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: false }).catch(() => {})} />
          <div className="rel">
            <ToolBtn icon="bolt" label="Huddle" active={pop === 'huddle' || !!myStatus} onClick={() => setPop(pop === 'huddle' ? null : 'huddle')} />
            {pop === 'huddle' && (
              <div className="popover huddle-pop" onClick={(e) => e.stopPropagation()}>
                <div className="pop-head"><span>Huddle Mode</span><small>Shows on your tile</small></div>
                <div className="status-grid">
                  {(Object.keys(STATUSES) as StatusKey[]).map((k) => (
                    <button key={k} className={'status-btn' + (myStatus === k ? ' on' : '')} style={{ ['--c' as any]: STATUSES[k].color }} onClick={() => setStatus(k)}>
                      <span className="se">{STATUSES[k].emoji}</span>
                      <span>{STATUSES[k].label}</span>
                      {myStatus === k && <small>Tap to clear</small>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ToolBtn icon="hand" label={handUp ? 'Lower' : 'Raise'} active={handUp} onClick={() => localParticipant.setAttributes({ hand: handUp ? '' : '1' }).catch(() => {})} />
          <div className="rel">
            <ToolBtn icon="smile" label="React" active={pop === 'react'} onClick={() => setPop(pop === 'react' ? null : 'react')} />
            {pop === 'react' && (
              <div className="popover react-pop" onClick={(e) => e.stopPropagation()}>
                {REACTIONS.map((r) => (
                  <button key={r} onClick={() => floatReact(r)}>{r}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="tb-side tb-right">
          <ToolBtn icon="chat" label="Chat" active={panel === 'chat'} badge={unread || undefined} onClick={() => setPanel(panel === 'chat' ? null : 'chat')} />
          <ToolBtn icon="users" label="People" active={panel === 'people'} badge={count} onClick={() => setPanel(panel === 'people' ? null : 'people')} />
          <div className="rel">
            <ToolBtn icon="palette" label="Color" active={pop === 'theme'} onClick={() => setPop(pop === 'theme' ? null : 'theme')} />
            {pop === 'theme' && <div className="theme-anchor"><ThemePicker onClose={() => setPop(null)} /></div>}
          </div>
          <button className="leave-btn" onClick={() => room.disconnect()}><Icon name="leave" size={18} /> Leave</button>
        </div>
      </footer>

      <StartAudio label="Click to turn on room audio" className="start-audio" />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast" style={{ ['--c' as any]: t.color || 'var(--accent)' }}>
            {t.emoji && <span className="te">{t.emoji}</span>}
            {t.text}
          </div>
        ))}
      </div>

      {invite && (
        <div className="pr-invite">
          <div className="pr-ic">🔒</div>
          <div className="pr-txt">
            <b>{invite.name} wants a private room</b>
            <small>Quick 1-on-1 coaching. You can come right back to the floor.</small>
          </div>
          <div className="btn-row">
            <button className="btn ghost sm" onClick={() => answerInvite(false)}>Not now</button>
            <button className="btn primary sm" onClick={() => answerInvite(true)}>Join private room</button>
          </div>
        </div>
      )}
      {pending && (
        <div className="pr-invite waiting">
          <span className="spinner lg" />
          <div className="pr-txt">
            <b>Inviting {pending.name} to a private room…</b>
            <small>You’ll both move there as soon as they accept.</small>
          </div>
          <button className="btn ghost sm" onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}

      {confirmEnd && (
        <div className="modal-bg" onClick={() => setConfirmEnd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>End this session for everyone?</h3>
            <p>All {count} agents will be disconnected and the room will close.</p>
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setConfirmEnd(false)}>Cancel</button>
              <button className="btn danger" onClick={() => { setConfirmEnd(false); moderate('end'); }}>End session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toggleReact(m: ChatMsg, emoji: string, who: string): ChatMsg {
  const r = { ...(m.reacts || {}) };
  const list = r[emoji] || [];
  r[emoji] = list.includes(who) ? list.filter((x) => x !== who) : [...list, who];
  if (!r[emoji].length) delete r[emoji];
  return { ...m, reacts: r };
}

/* ---------------------------------- stage --------------------------------- */
function bestGrid(n: number, W: number, H: number, gap: number) {
  const aspect = 16 / 9;
  let best = { cols: 1, rows: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let w = (W - gap * (cols - 1)) / cols;
    let h = w / aspect;
    if (h * rows + gap * (rows - 1) > H) {
      h = (H - gap * (rows - 1)) / rows;
      w = h * aspect;
    }
    if (w > best.w) best = { cols, rows, w, h };
  }
  return best;
}

function Stage({ participants, share, floats, now, isHost, onModerate, onPrivate }: { participants: Participant[]; share?: TrackReference; floats: Float[]; now: number; isHost: boolean; onModerate: (a: string, id?: string) => void; onPrivate?: (p: Participant) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const pageSize = size.w >= 1000 ? 25 : size.w >= 640 ? 12 : 6;
  // When there are more agents than fit, pull recent speakers onto page 1.
  const list = useMemo(() => {
    if (participants.length <= pageSize) return participants;
    const recent = (p: Participant) => (p.isSpeaking || (p.lastSpokeAt && now - p.lastSpokeAt.getTime() < 20000) ? 1 : 0);
    const [local, ...rest] = participants;
    const speakers = rest.filter(recent).sort((a, b) => (b.lastSpokeAt?.getTime() || 0) - (a.lastSpokeAt?.getTime() || 0));
    const others = rest.filter((p) => !recent(p));
    return [local, ...speakers, ...others];
  }, [participants, pageSize, now]);

  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const pg = Math.min(page, pages - 1);
  const visible = list.slice(pg * pageSize, pg * pageSize + pageSize);
  const gap = size.w < 640 ? 6 : 10;

  if (share) {
    return (
      <div className="stage share-mode" ref={ref}>
        <div className="share-main">
          <VideoTrack trackRef={share} className="share-video" />
          <div className="share-label"><Icon name="screen" size={14} /> {share.participant.name} is sharing their screen</div>
        </div>
        <div className="filmstrip">
          {participants.map((p) => (
            <Tile key={p.identity} p={p} w={220} h={124} floats={floats} now={now} isHost={isHost} onModerate={onModerate} onPrivate={onPrivate} />
          ))}
        </div>
      </div>
    );
  }

  const g = bestGrid(visible.length, size.w - 2, size.h - (pages > 1 ? 40 : 0) - 2, gap);
  return (
    <div className="stage" ref={ref}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${g.cols}, ${Math.floor(g.w)}px)`, gap }}>
        {visible.map((p) => (
          <Tile key={p.identity} p={p} w={g.w} h={g.h} floats={floats} now={now} isHost={isHost} onModerate={onModerate} onPrivate={onPrivate} />
        ))}
      </div>
      {participants.length === 1 && (
        <div className="alone">You’re the first one here. Share the invite link so your team can join.</div>
      )}
      {pages > 1 && (
        <div className="pager">
          <button className="icon-btn sm" disabled={pg === 0} onClick={() => setPage(pg - 1)} aria-label="Previous page"><Icon name="chevL" size={16} /></button>
          <span>Page {pg + 1} of {pages} · {participants.length} agents</span>
          <button className="icon-btn sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="Next page"><Icon name="chevR" size={16} /></button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- tile ---------------------------------- */
function Tile({ p, w, h, floats, now, isHost, onModerate, onPrivate }: { p: Participant; w: number; h: number; floats: Float[]; now: number; isHost: boolean; onModerate: (a: string, id?: string) => void; onPrivate?: (p: Participant) => void }) {
  const camPub = p.getTrackPublication(Track.Source.Camera);
  const camRef = { participant: p, publication: camPub, source: Track.Source.Camera } as TrackReference;
  const camMuted = useIsMuted(camRef);
  const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone, publication: p.getTrackPublication(Track.Source.Microphone) } as TrackReference);
  const speaking = useIsSpeaking(p);
  const { quality } = useConnectionQualityIndicator({ participant: p });
  const { attributes } = useParticipantAttributes({ participant: p });
  const status = activeStatus(attributes);
  const hand = attributes?.hand === '1';
  const avatar = attributes?.avatar;
  const team = attributes?.team;
  const host = attributes?.role === 'host';
  const showVideo = !!camPub && !camMuted;
  const small = w < 260;
  const myFloats = floats.filter((f) => f.identity === p.identity);
  const av = Math.max(44, Math.min(120, h * 0.36));

  return (
    <div className={'tile' + (speaking && !micMuted ? ' speaking' : '') + (small ? ' small' : '') + (status === 'break' ? ' away' : '')} style={{ width: w, height: h }}>
      {showVideo ? (
        <VideoTrack trackRef={camRef} className={p.isLocal ? 'mirror' : ''} />
      ) : (
        <div className="tile-off">
          {avatar ? (
            <img src={avatar} alt="" style={{ width: av, height: av }} />
          ) : (
            <div className="avatar" style={{ width: av, height: av, fontSize: av * 0.38, background: colorFor(p.identity) }}>{initials(p.name || '?')}</div>
          )}
        </div>
      )}

      <div className="tile-top">
        {status && (
          <span className="status-chip" style={{ ['--c' as any]: STATUSES[status].color }}>
            {STATUSES[status].emoji} {!small && STATUSES[status].label}
          </span>
        )}
        <span className="grow" />
        {hand && <span className="hand-chip">✋</span>}
        <Bars q={quality} />
      </div>

      <div className="tile-bottom">
        <span className={'name-chip' + (micMuted ? '' : ' hot')}>
          <span className={'mic-dot' + (micMuted ? ' off' : '')}><Icon name={micMuted ? 'micOff' : 'mic'} size={13} stroke={2.2} /></span>
          <span className="nm">{p.name || 'Agent'}{p.isLocal ? ' (You)' : ''}</span>
          {host && <span className="host-tag">Host</span>}
          {team && !small && <span className="team">{team}</span>}
        </span>
        {!showVideo && !small && <span className="cam-off-chip"><Icon name="camOff" size={13} /></span>}
      </div>

      {isHost && !p.isLocal && (
        <div className="tile-admin">
          {!micMuted && <button onClick={() => onModerate('mute', p.identity)} title="Mute"><Icon name="micOff" size={14} /></button>}
          <button onClick={() => onModerate('remove', p.identity)} title="Remove from session"><Icon name="remove" size={14} /></button>
        </div>
      )}

      {onPrivate && !p.isLocal && (
        <button className="pr-btn" onClick={() => onPrivate(p)} title={`Private room with ${p.name}`}>
          <Icon name="lock" size={13} /> {small ? '1-on-1' : 'Private room'}
        </button>
      )}

      {myFloats.map((f) => (
        <span key={f.id} className="float" style={{ left: f.x + '%' }}>{f.emoji}</span>
      ))}
    </div>
  );
}

function Bars({ q }: { q: ConnectionQuality }) {
  const lvl = q === ConnectionQuality.Excellent ? 3 : q === ConnectionQuality.Good ? 2 : q === ConnectionQuality.Poor ? 1 : q === ConnectionQuality.Lost ? 0 : -1;
  if (lvl < 0) return null;
  return (
    <span className={'bars l' + lvl} title={`Connection: ${q}`}>
      <i /><i /><i />
    </span>
  );
}

function ConnBadge({ state }: { state: ConnectionState }) {
  const map: Record<string, [string, string]> = {
    connected: ['Connected', 'ok'],
    connecting: ['Connecting…', 'warn'],
    reconnecting: ['Reconnecting…', 'warn'],
    signalReconnecting: ['Reconnecting…', 'warn'],
    disconnected: ['Offline', 'bad'],
  };
  const [label, cls] = map[state] || [state, 'warn'];
  return <span className={'conn ' + cls}><Icon name="wifi" size={14} /> {label}</span>;
}

function ToolBtn({ icon, label, onClick, active, off, badge }: { icon: string; label: string; onClick: () => void; active?: boolean; off?: boolean; badge?: number }) {
  return (
    <button className={'tool' + (active ? ' active' : '') + (off ? ' off' : '')} onClick={onClick}>
      <span className="ti"><Icon name={icon} size={20} />{badge ? <span className="tbadge">{badge > 99 ? '99+' : badge}</span> : null}</span>
      <span className="tl">{label}</span>
    </button>
  );
}

/* ---------------------------------- chat ---------------------------------- */
function ChatPanel({ msgs, me, people, onSend, onReact, onAnswer, mode }: {
  msgs: ChatMsg[];
  me: string;
  people: Participant[];
  onSend: (m: { text: string; to?: string; toName?: string; q?: boolean }) => void;
  onReact: (id: string, e: string) => void;
  onAnswer: (id: string) => void;
  mode: { q?: boolean; prefill?: string; n: number };
}) {
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState(false);
  const [filter, setFilter] = useState<'all' | 'q'>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!mode.n) return;
    setQ(!!mode.q);
    setTo('');
    if (mode.prefill !== undefined) setText(mode.prefill);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [mode.n]); // eslint-disable-line

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, filter]);

  const shown = filter === 'q' ? msgs.filter((m) => m.q) : msgs;
  const toP = people.find((p) => p.identity === to);

  function submit() {
    if (!text.trim()) return;
    onSend({ text, to: to || undefined, toName: toP?.name, q: q && !to });
    setText('');
    setQ(false);
  }

  return (
    <div className="chat">
      <div className="chat-filter">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All messages</button>
        <button className={filter === 'q' ? 'on' : ''} onClick={() => setFilter('q')}>Questions {msgs.filter((m) => m.q && !m.answered).length ? <b>{msgs.filter((m) => m.q && !m.answered).length}</b> : null}</button>
      </div>
      <div className="chat-list" ref={listRef}>
        {shown.length === 0 && (
          <div className="chat-empty">
            <Icon name={filter === 'q' ? 'question' : 'chat'} size={26} />
            <p>{filter === 'q' ? 'No questions yet.' : 'Chat without unmuting.'}</p>
            <small>{filter === 'q' ? 'Tap “Ask the group” below to post one.' : 'Ask a question, drop a quick note, or share a win. New messages show here for everyone in the session.'}</small>
          </div>
        )}
        {shown.map((m, i) => {
          const mine = m.from === me;
          const prev = shown[i - 1];
          const cont = prev && prev.from === m.from && !m.q && !prev.q && m.ts - prev.ts < 120000 && !m.to && !prev.to;
          return (
            <div key={m.id} className={'msg' + (mine ? ' mine' : '') + (m.q ? ' question' : '') + (m.to ? ' dm' : '') + (m.kind ? ' ' + m.kind : '') + (cont ? ' cont' : '') + (m.answered ? ' answered' : '')}>
              {!cont && (
                <div className="msg-head">
                  <b>{mine ? 'You' : m.name}</b>
                  {m.to && <span className="dm-tag">{mine ? `Private to ${m.toName || 'agent'}` : 'Private to you'}</span>}
                  <span className="time">{new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              )}
              <div className="bubble">
                {m.q && <span className="q-tag">{m.answered ? '✓ Answered' : 'Question'}</span>}
                <span className="txt">{m.text}</span>
              </div>
              <div className="msg-actions">
                {MSG_REACTS.map((e) => (
                  <button key={e} onClick={() => onReact(m.id, e)}>{e}</button>
                ))}
                {m.q && !m.answered && <button className="ans" onClick={() => onAnswer(m.id)}><Icon name="check" size={13} /> Mark answered</button>}
              </div>
              {m.reacts && Object.keys(m.reacts).length > 0 && (
                <div className="reacts">
                  {Object.entries(m.reacts).map(([e, who]) => (
                    <button key={e} className={who.includes(me) ? 'on' : ''} onClick={() => onReact(m.id, e)}>{e} {who.length}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="composer">
        <div className="quick">
          {QUICK_MSGS.map((t) => (
            <button key={t} onClick={() => onSend({ text: t })}>{t}</button>
          ))}
        </div>
        <div className="comp-row">
          <select value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value) setQ(false); }} aria-label="Send to">
            <option value="">To: Everyone</option>
            {people.map((p) => (
              <option key={p.identity} value={p.identity}>To: {p.name} (private)</option>
            ))}
          </select>
          <button className={'ask-btn' + (q ? ' on' : '')} disabled={!!to} onClick={() => { setQ(!q); inputRef.current?.focus(); }}>
            <Icon name="question" size={15} /> Ask the group
          </button>
        </div>
        <div className={'input-wrap' + (q ? ' q' : '')}>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder={q ? 'Type your question for the group…' : to ? `Message ${toP?.name || ''} privately…` : 'Message everyone…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={1000}
          />
          <button className="send" onClick={submit} disabled={!text.trim()} aria-label="Send"><Icon name="send" size={17} /></button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- people --------------------------------- */
function PeoplePanel({ people, isHost, onModerate, now, onPrivate }: { people: Participant[]; isHost: boolean; onModerate: (a: string, id?: string) => void; now: number; onPrivate?: (p: Participant) => void }) {
  const [confirm, setConfirm] = useState('');
  const talking = people.filter((p) => !(p.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true));
  return (
    <div className="people">
      <div className="people-sum">
        <span><b>{people.length}</b> in session</span>
        <span><b>{talking.length}</b> unmuted</span>
        <span><b>{people.filter((p) => p.attributes?.hand === '1').length}</b> hands up</span>
      </div>
      {isHost && (
        <div className="host-row">
          <button className="btn ghost sm" onClick={() => onModerate('muteall')}><Icon name="micOff" size={14} /> Mute everyone</button>
        </div>
      )}
      <div className="people-list">
        {people.map((p) => {
          const micMuted = p.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
          const camOn = !!p.getTrackPublication(Track.Source.Camera) && !p.getTrackPublication(Track.Source.Camera)?.isMuted;
          const st = activeStatus(p.attributes);
          const av = p.attributes?.avatar;
          const joined = p.joinedAt ? now - p.joinedAt.getTime() : 0;
          return (
            <div key={p.identity} className={'person' + (p.isSpeaking && !micMuted ? ' speaking' : '')}>
              {av ? <img className="pav" src={av} alt="" /> : <span className="pav" style={{ background: colorFor(p.identity) }}>{initials(p.name || '?')}</span>}
              <div className="pinfo">
                <div className="pname">
                  {p.name}{p.isLocal ? ' (You)' : ''}
                  {p.attributes?.role === 'host' && <span className="host-tag">Host</span>}
                  {p.attributes?.hand === '1' && <span>✋</span>}
                </div>
                <div className="psub">
                  {st ? <span style={{ color: STATUSES[st].color }}>{STATUSES[st].emoji} {STATUSES[st].label}</span> : <span>{p.attributes?.team || 'Agent'}</span>}
                  <span>· {fmtDuration(joined)}</span>
                </div>
              </div>
              <span className={'pic' + (micMuted ? ' off' : ' on')}><Icon name={micMuted ? 'micOff' : 'mic'} size={15} /></span>
              <span className={'pic' + (camOn ? '' : ' off')}><Icon name={camOn ? 'cam' : 'camOff'} size={15} /></span>
              {onPrivate && !p.isLocal && (
                <button className="icon-btn xs pr-mini" onClick={() => onPrivate(p)} title={`Private room with ${p.name}`}><Icon name="lock" size={14} /></button>
              )}
              {isHost && !p.isLocal && (
                confirm === p.identity ? (
                  <span className="pconfirm">
                    <button className="btn danger xs" onClick={() => { onModerate('remove', p.identity); setConfirm(''); }}>Remove</button>
                    <button className="btn ghost xs" onClick={() => setConfirm('')}>No</button>
                  </span>
                ) : (
                  <span className="pact">
                    <button className="icon-btn xs" disabled={micMuted} onClick={() => onModerate('mute', p.identity)} title="Mute"><Icon name="micOff" size={14} /></button>
                    <button className="icon-btn xs" onClick={() => setConfirm(p.identity)} title="Remove"><Icon name="remove" size={14} /></button>
                  </span>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
