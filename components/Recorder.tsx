'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Participant, RemoteTrack, Room, RoomEvent, Track } from 'livekit-client';

/** Records this browser tab (the video grid) + everyone's audio to a file on the host's computer. */
export function useRecorder(room: Room, title: string, onError: (msg: string) => void) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const st = useRef<{ rec?: MediaRecorder; chunks: Blob[]; disp?: MediaStream; ctx?: AudioContext; dest?: MediaStreamAudioDestinationNode; added: Set<string>; mime: string; off?: () => void }>({ chunks: [], added: new Set(), mime: '' });

  const addTrack = useCallback((mst?: MediaStreamTrack) => {
    const s = st.current;
    if (!mst || !s.ctx || !s.dest || s.added.has(mst.id)) return;
    s.added.add(mst.id);
    try {
      s.ctx.createMediaStreamSource(new MediaStream([mst])).connect(s.dest);
    } catch {}
  }, []);

  const stop = useCallback(() => {
    const s = st.current;
    if (s.rec && s.rec.state !== 'inactive') s.rec.stop();
  }, []);

  const start = useCallback(async () => {
    const s = st.current;
    if (s.rec && s.rec.state === 'recording') return;
    let disp: MediaStream;
    try {
      disp = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 24 },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      } as any);
    } catch {
      onError('Recording cancelled — pick this Huddle tab to record.');
      return;
    }
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    Object.assign(s, { disp, ctx, dest, chunks: [], added: new Set<string>() });

    // my mic (silent while muted) + every remote agent's audio
    addTrack(room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack);
    room.remoteParticipants.forEach((p) =>
      p.audioTrackPublications.forEach((pub) => addTrack(pub.track?.mediaStreamTrack)),
    );
    const onSub = (t: RemoteTrack) => {
      if (t.kind === Track.Kind.Audio) addTrack(t.mediaStreamTrack);
    };
    const onLocal = () => addTrack(room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack);
    room.on(RoomEvent.TrackSubscribed, onSub);
    room.on(RoomEvent.LocalTrackPublished, onLocal);
    s.off = () => {
      room.off(RoomEvent.TrackSubscribed, onSub);
      room.off(RoomEvent.LocalTrackPublished, onLocal);
    };

    const out = new MediaStream([...disp.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    s.mime = mime;
    const rec = new MediaRecorder(out, { mimeType: mime || undefined, videoBitsPerSecond: 2_500_000 });
    s.rec = rec;
    rec.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
    rec.onstop = () => {
      const type = s.mime.split(';')[0] || 'video/webm';
      const blob = new Blob(s.chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Huddle - ${title.replace(/[\\/:*?"<>|]/g, '')} - ${stamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      s.disp?.getTracks().forEach((t) => t.stop());
      s.ctx?.close().catch(() => {});
      s.off?.();
      s.rec = undefined;
      setStartedAt(null);
      room.localParticipant.setAttributes({ rec: '' }).catch(() => {});
    };
    disp.getVideoTracks()[0]?.addEventListener('ended', stop);
    rec.start(1000);
    setStartedAt(Date.now());
    room.localParticipant.setAttributes({ rec: '1' }).catch(() => {});
  }, [room, title, onError, addTrack, stop]);

  // save if the host leaves while recording
  useEffect(() => () => stop(), [stop]);

  return { recording: startedAt !== null, startedAt, start, stop };
}

export function whoIsRecording(people: Participant[]) {
  return people.find((p) => p.attributes?.rec === '1');
}
