import { ConnectionState, RoomEvent, Track, type Room, type RemoteParticipant, type RemoteTrackPublication } from 'livekit-client';

// Observe publication metadata in the joined room's screen connection, never a
// browsed-room observer. Subscriptions and React navigation do not create events.
export function observeScreenStarts(room: Room, notify: () => void) {
  let ready = room.state === ConnectionState.Connected;
  const known = new Set<string>();
  const active = new Map<string, Set<string>>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const clear = () => { for (const timer of pending.values()) clearTimeout(timer); pending.clear(); active.clear(); known.clear(); };
  const remember = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    known.add(publication.trackSid);
    const tracks = active.get(participant.identity) ?? new Set<string>();
    tracks.add(publication.trackSid); active.set(participant.identity, tracks);
  };
  const snapshot = () => {
    clear();
    for (const participant of room.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) {
      if (publication.source === Track.Source.ScreenShare) remember(publication, participant);
    }
    ready = true;
  };
  if (ready) snapshot();
  const pause = () => { ready = false; clear(); };
  const published = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (publication.source !== Track.Source.ScreenShare || participant.isLocal) return;
    const fresh = !known.has(publication.trackSid) && !active.get(participant.identity)?.size;
    remember(publication, participant);
    if (fresh && ready && room.state === ConnectionState.Connected) notify();
  };
  const unpublished = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (publication.source !== Track.Source.ScreenShare) return;
    // A short unpublish/republish sequence is a replacement, not a new share.
    clearTimeout(pending.get(publication.trackSid));
    pending.set(publication.trackSid, setTimeout(() => {
      active.get(participant.identity)?.delete(publication.trackSid);
      pending.delete(publication.trackSid);
    }, 500));
  };
  const left = (participant: RemoteParticipant) => { active.delete(participant.identity); };
  room.on(RoomEvent.Connected, snapshot).on(RoomEvent.Reconnected, snapshot)
    .on(RoomEvent.Reconnecting, pause).on(RoomEvent.SignalReconnecting, pause).on(RoomEvent.Disconnected, pause)
    .on(RoomEvent.TrackPublished, published).on(RoomEvent.TrackUnpublished, unpublished).on(RoomEvent.ParticipantDisconnected, left);
  return () => {
    pause();
    room.off(RoomEvent.Connected, snapshot).off(RoomEvent.Reconnected, snapshot)
      .off(RoomEvent.Reconnecting, pause).off(RoomEvent.SignalReconnecting, pause).off(RoomEvent.Disconnected, pause)
      .off(RoomEvent.TrackPublished, published).off(RoomEvent.TrackUnpublished, unpublished).off(RoomEvent.ParticipantDisconnected, left);
  };
}
