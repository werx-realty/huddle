'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Logo } from '@/components/Icon';
import { ThemePicker } from '@/components/ThemePicker';
import { colorFor, fmtDuration, initials, loadProfile, makeAvatar, Profile, saveProfile, setHostKey } from '@/lib/client';

type RoomRow = { name: string; title: string; host: string; locked: boolean; max: number; createdAt: number; participants: number };

export default function Lobby() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [roomErr, setRoomErr] = useState('');
  const [joinTarget, setJoinTarget] = useState('');
  const [title, setTitle] = useState('');
  const [max, setMax] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showTheme, setShowTheme] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [photoSrc, setPhotoSrc] = useState('');
  const [photoMode, setPhotoMode] = useState<'fit' | 'fill'>('fill');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camErr, setCamErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProfile(loadProfile());
    const q = new URLSearchParams(location.search).get('join');
    if (q) setJoinTarget(q);
    const reason = new URLSearchParams(location.search).get('msg');
    if (reason) setErr(reason);
  }, []);

  const loadRooms = useCallback(async () => {
    try {
      const r = await fetch('/api/rooms', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRooms(d.rooms);
      setRoomErr('');
    } catch (e: any) {
      setRoomErr(e.message || 'Could not load sessions');
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    loadRooms();
    const t = setInterval(loadRooms, 5000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [loadRooms]);

  // Camera preview
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    if (profile.camOn) {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: 640, height: 360 }, audio: false })
        .then((s) => {
          if (cancelled) return s.getTracks().forEach((t) => t.stop());
          streamRef.current = s;
          if (videoRef.current) videoRef.current.srcObject = s;
          setCamErr('');
        })
        .catch(() => setCamErr('Camera blocked or not found'));
    }
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [profile?.camOn]); // eslint-disable-line

  useEffect(() => {
    if (!photoSrc) return;
    makeAvatar(photoSrc, photoMode).then((a) => setProfile((p) => (p ? { ...p, avatar: a } : p)));
  }, [photoSrc, photoMode]);

  if (!profile) return <div className="lobby" />;

  const update = (patch: Partial<Profile>) => setProfile({ ...profile, ...patch });
  const ready = profile.name.trim().length > 1;

  function go(room: string) {
    if (!ready) {
      setErr('Enter your name first.');
      document.getElementById('name-input')?.focus();
      return;
    }
    saveProfile({ ...profile!, name: profile!.name.trim(), team: profile!.team.trim() });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    router.push('/room/' + encodeURIComponent(room));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) {
      setErr('Enter your name first.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title || 'Prospecting Power Hour', host: profile!.name, max }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setHostKey(d.name, d.hostKey);
      go(d.name);
    } catch (e: any) {
      setErr(e.message || 'Could not start session');
      setBusy(false);
    }
  }

  const live = rooms || [];
  const target = joinTarget && live.find((r) => r.name === joinTarget);

  return (
    <div className="lobby" onClick={() => setShowTheme(false)}>
      <header className="lobby-top">
        <div className="brand">
          <Logo />
          <span>Huddle</span>
        </div>
        <div className="top-right">
          <div className="rel">
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowTheme((v) => !v); }} aria-label="App color">
              <Icon name="palette" />
            </button>
            {showTheme && <ThemePicker onClose={() => setShowTheme(false)} />}
          </div>
        </div>
      </header>

      <main className="lobby-main">
        <section className="hero-copy">
          <h1>Your team’s calling floor.</h1>
          <p>Dial on your own phone, stay muted, and see everyone working. Tap the mic when you need the room.</p>
        </section>

        <div className="lobby-grid">
          <section className="card profile-card">
            <div className="preview">
              {profile.camOn && !camErr ? (
                <video ref={videoRef} autoPlay playsInline muted className="mirror" />
              ) : (
                <div className="preview-off">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="" className="avatar-xl" />
                  ) : (
                    <div className="avatar-xl" style={{ background: colorFor(profile.identity) }}>{initials(profile.name || '?')}</div>
                  )}
                  {camErr && <small className="muted">{camErr}</small>}
                </div>
              )}
              <div className="preview-bar">
                <button className={'round-btn' + (profile.camOn ? '' : ' off')} onClick={() => update({ camOn: !profile.camOn })} aria-label="Toggle camera">
                  <Icon name={profile.camOn ? 'cam' : 'camOff'} />
                </button>
                <span className="pill-muted"><Icon name="micOff" size={15} /> You’ll join muted</span>
              </div>
            </div>

            <div className="form">
              <label>
                <span>Your name</span>
                <input id="name-input" value={profile.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Maria Santos" maxLength={40} autoComplete="name" />
              </label>
              <label>
                <span>Team or company <em>(optional)</em></span>
                <input value={profile.team} onChange={(e) => update({ team: e.target.value })} placeholder="e.g. AXEN Realty" maxLength={40} />
              </label>
              <div className="photo-row">
                <div className="photo-thumb">
                  {profile.avatar ? <img src={profile.avatar} alt="" /> : <span style={{ background: colorFor(profile.identity) }}>{initials(profile.name || '?')}</span>}
                </div>
                <div className="photo-actions">
                  <span className="lbl">Photo when camera is off</span>
                  <div className="btn-row">
                    <button className="btn ghost sm" onClick={() => fileRef.current?.click()}><Icon name="image" size={15} /> Upload</button>
                    {profile.avatar && (
                      <>
                        <button className={'btn ghost sm' + (photoMode === 'fit' ? ' active' : '')} disabled={!photoSrc} onClick={() => setPhotoMode(photoMode === 'fit' ? 'fill' : 'fit')}>Fit</button>
                        <button className="btn ghost sm" onClick={() => { update({ avatar: '' }); setPhotoSrc(''); }}>Remove</button>
                      </>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const rd = new FileReader();
                    rd.onload = () => setPhotoSrc(String(rd.result));
                    rd.readAsDataURL(f);
                    e.target.value = '';
                  }} />
                </div>
              </div>
              {err && <div className="err">{err}</div>}
            </div>
          </section>

          <section className="card sessions-card">
            <div className="card-head">
              <h2>Live sessions</h2>
              <span className="live-count"><span className="dot-live" /> {live.reduce((a, r) => a + r.participants, 0)} agents on the floor</span>
            </div>

            {target && (
              <div className="invite-banner">
                You were invited to <b>{target.title}</b>
                <button className="btn primary" onClick={() => go(target.name)}>Join Huddle</button>
              </div>
            )}

            <div className="session-list">
              {rooms === null && <div className="empty">Loading sessions…</div>}
              {roomErr && <div className="err">Video server: {roomErr}</div>}
              {rooms && !roomErr && live.length === 0 && (
                <div className="empty">
                  <Icon name="calendar" size={28} />
                  <p>No sessions running right now.</p>
                  <small>Start one below and invite your team.</small>
                </div>
              )}
              {live.map((r) => (
                <div key={r.name} className={'session' + (r.name === joinTarget ? ' highlight' : '')}>
                  <div className="s-info">
                    <div className="s-title">
                      {r.title}
                      {r.locked && <span className="tag"><Icon name="lock" size={12} /> Locked</span>}
                    </div>
                    <div className="s-meta">
                      <span>Host: {r.host || '—'}</span>
                      <span>·</span>
                      <span>Live {fmtDuration(now - r.createdAt)}</span>
                    </div>
                  </div>
                  <div className="s-count" title="Participants">
                    <Icon name="users" size={15} /> {r.participants}<small>/{r.max}</small>
                  </div>
                  <button className="btn primary" disabled={r.locked} onClick={() => go(r.name)}>Join Huddle</button>
                </div>
              ))}
            </div>

            <form className="create" onSubmit={create}>
              <div className="create-title">Start a calling session</div>
              <div className="create-row">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tuesday Prospecting Power Hour" maxLength={80} />
                <label className="max">
                  <span>Max</span>
                  <input type="number" min={2} max={100} value={max} onChange={(e) => setMax(parseInt(e.target.value, 10) || 50)} />
                </label>
                <button className="btn primary" disabled={busy}><Icon name="plus" size={16} /> {busy ? 'Starting…' : 'Start'}</button>
              </div>
              <small className="muted">You’ll be the host: you can mute, remove, lock and end the session.</small>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
