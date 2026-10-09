import React from 'react';
import { VideoTile } from './VideoTile';

export function VideoGrid({
  localUser,
  localStream,
  localAudioLevel = 0,
  localIsSpeaking = false,
  screenStream = null,
  isScreenSharing = false,
  remoteParticipants = [],
  pinnedId = null,
  onTogglePin,
}) {
  const participants = [
    { ...localUser, isLocal: true },
    ...remoteParticipants,
  ];
  const getTileProps = (participant) => ({
    participant,
    isLocal: participant.isLocal,
    stream: participant.isLocal ? localStream : participant.stream,
    audioLevel: participant.isLocal ? localAudioLevel : participant.audioLevel,
    isSpeaking: participant.isLocal ? localIsSpeaking : participant.isSpeaking,
    isPinned: pinnedId === (participant.id || 'local'),
    onTogglePin: () => onTogglePin(participant.id || 'local'),
  });

  const pinnedParticipant = participants.find(
    (participant) => (participant.id || 'local') === pinnedId
  );
  const spotlightParticipant = pinnedParticipant
    || participants.find((participant) => participant.isSpeaking)
    || remoteParticipants[0]
    || participants[0];
  const otherParticipants = participants.filter(
    (participant) => participant !== spotlightParticipant
  );

  return (
    <div className="flex h-full w-full min-h-0 flex-col gap-3 p-3 md:gap-4 md:p-5">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative aspect-video w-full max-h-full">
          <VideoTile
            className="absolute inset-0"
            participant={isScreenSharing && screenStream
              ? { name: `${localUser.name}'s Screen`, isVideoDisabled: false, isMuted: true }
              : spotlightParticipant}
            stream={isScreenSharing && screenStream
              ? screenStream
              : spotlightParticipant.isLocal ? localStream : spotlightParticipant.stream}
            isLocal={!isScreenSharing && spotlightParticipant.isLocal}
            isScreenShare={Boolean(isScreenSharing && screenStream)}
            audioLevel={spotlightParticipant.isLocal ? localAudioLevel : spotlightParticipant.audioLevel}
            isSpeaking={spotlightParticipant.isLocal ? localIsSpeaking : spotlightParticipant.isSpeaking}
            isPinned={Boolean(pinnedParticipant)}
            isSpotlight
            onTogglePin={isScreenSharing && screenStream
              ? undefined
              : () => onTogglePin(spotlightParticipant.id || 'local')}
          />
          {isScreenSharing && screenStream && (
            <div className="pointer-events-none absolute inset-0 rounded-[22px] border border-[#b9d88d]/60" />
          )}
        </div>
      </div>

      {otherParticipants.length > 0 && (
        <div className="flex h-[clamp(92px,22vh,180px)] shrink-0 gap-2.5 overflow-x-auto scrollbar-none md:gap-3">
          {otherParticipants.map((participant) => (
            <div
              key={participant.id || 'local'}
              className="h-full min-w-[140px] flex-1 basis-0"
            >
              <VideoTile {...getTileProps(participant)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
