'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Icon, Logo } from '@/components/Icon';
import { getHostKey, loadProfile, Profile } from '@/lib/client';

const HuddleRoom = dynamic(() => import('@/components/Room').then((m) => m.HuddleRoom), { ssr: false });

type Conn = { token: string; url: string; host: boolean };

export default function RoomPage() {
  const params = useParams<{ room: string }>();
  const roomName = decodeURIComponent(params.room);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [lost, setLost] = useState(0);
  const [hostKey, setHK] = useState('');

  const connect = useCallback(async (p: Profile) => {
    setError(null);
    try {
      const hk = getHostKey(roomName);
      setHK(hk);
      const r = await fetch('/api/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room: roomName, name: p.name, team: p.team, identity: p.identity, hostKey: hk }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError({ text: d.error || 'Could not join', code: d.code });
        return;
      }
      setConn({ token: d.token, url: d.url, host: d.host });
    } catch {
      setError({ text: 'Network problem — check your internet connection.', code: 'net' });
    }
  }, [roomName]);

  useEffect(() => {
    const p = loadProfile();
    if (!p.name) {
      router.replace('/?join=' + encodeURIComponent(roomName));
      return;
    }
    setProfile(p);
    connect(p);
  }, [connect, roomName, router]);

  // Auto-retry after an unexpected disconnect (internet drop)
  useEffect(() => {
    if (!lost || !profile) return;
    const t = setTimeout(() => connect(profile), 2500);
    return () => clearTimeout(t);
  }, [lost, profile, connect]);

  if (error) {
    return (
      <div className="center-screen">
        <div className="card msg-card">
          <Logo size={36} />
          <h2>{error.code === 'ended' ? 'Session ended' : error.code === 'locked' ? 'Session locked' : error.code === 'full' ? 'Session full' : 'Can’t join right now'}</h2>
          <p>{error.text}</p>
          <div className="btn-row center">
            {(error.code === 'net' || error.code === 'locked' || error.code === 'full' || !error.code) && profile && (
              <button className="btn primary" onClick={() => connect(profile)}><Icon name="refresh" size={16} /> Try again</button>
            )}
            <button className="btn ghost" onClick={() => router.push('/')}>Back to lobby</button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile || !conn) {
    return (
      <div className="center-screen">
        <div className="joining"><span className="spinner lg" /> {lost ? 'Reconnecting to the session…' : 'Joining the calling floor…'}</div>
      </div>
    );
  }

  return (
    <HuddleRoom
      key={conn.token}
      roomName={roomName}
      token={conn.token}
      url={conn.url}
      isHost={conn.host}
      hostKey={hostKey}
      profile={profile}
      onExit={(reason) => {
        if (reason === '__lost__') {
          setConn(null);
          setLost((n) => n + 1);
        } else if (reason) {
          router.push('/?msg=' + encodeURIComponent(reason));
        } else {
          router.push('/');
        }
      }}
    />
  );
}
