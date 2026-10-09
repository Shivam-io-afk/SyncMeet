import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../services/socketService';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const MAX_ICE_RESTART_ATTEMPTS = 2;

export function useWebRTC(localStream, session) {
  const [remotePeers, setRemotePeers] = useState([]);
  const peerConnections = useRef(new Map()); // socketId -> RTCPeerConnection
  const pendingIceCandidates = useRef(new Map());
  const remoteStreams = useRef(new Map());
  const iceRestartStates = useRef(new Map());
  const restartPeerRef = useRef(null);
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  const syncLocalTracks = useCallback(async (pc, stream) => {
    const tracks = stream?.getTracks() || [];
    const replacements = ['audio', 'video'].map((kind) => {
      let transceiver = pc.getTransceivers().find((item) => item.receiver.track.kind === kind);
      if (!transceiver) {
        transceiver = pc.addTransceiver(kind, { direction: 'sendrecv' });
      }

      const track = tracks.find((item) => item.kind === kind) || null;
      transceiver.direction = track ? 'sendrecv' : 'recvonly';
      if (transceiver.sender.track !== track) {
        return transceiver.sender.replaceTrack(track).catch((err) => {
          console.warn(`Could not update local ${kind} track:`, err);
          throw err;
        });
      }
      return Promise.resolve();
    });
    await Promise.all(replacements);
  }, []);

  // Helper to create PeerConnection for a remote socket
  const createPeerConnection = useCallback((targetSocketId, remoteUser) => {
    if (peerConnections.current.has(targetSocketId)) {
      return peerConnections.current.get(targetSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current.set(targetSocketId, pc);
    iceRestartStates.current.set(targetSocketId, {
      attempts: 0,
      pending: false,
      timer: null,
      retryTimer: null,
    });
    // Handle remote track
    pc.ontrack = (event) => {
      let remoteStream = remoteStreams.current.get(targetSocketId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteStreams.current.set(targetSocketId, remoteStream);
      }
      const sourceTracks = event.streams[0]?.getTracks() || [event.track];
      sourceTracks.forEach((track) => {
        if (!remoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      setRemotePeers((prev) => {
        const existing = prev.find((p) => p.socketId === targetSocketId);
        if (existing) {
          return prev.map((p) =>
            p.socketId === targetSocketId ? { ...p, stream: remoteStream } : p
          );
        }
        return [
          ...prev,
          {
            socketId: targetSocketId,
            user: remoteUser || { name: 'Participant' },
            stream: remoteStream,
            isMuted: false,
            isVideoOff: false,
            isHandRaised: false,
          },
        ];
      });
    };

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendIceCandidate(targetSocketId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      const restartState = iceRestartStates.current.get(targetSocketId);
      if (pc.connectionState === 'connected' && restartState) {
        if (restartState.timer) clearTimeout(restartState.timer);
        if (restartState.retryTimer) clearTimeout(restartState.retryTimer);
        restartState.attempts = 0;
        restartState.pending = false;
        restartState.timer = null;
        restartState.retryTimer = null;
      } else if (pc.connectionState === 'failed') {
        console.warn(`WebRTC connection to participant ${targetSocketId} failed. Attempting ICE recovery; a TURN relay may still be required.`);
        const localSocketId = socketService.getSocketId();
        if (!localSocketId || localSocketId > targetSocketId) {
          socketService.requestIceRestart(targetSocketId);
        } else {
          restartPeerRef.current?.(targetSocketId);
        }
      }
    };

    return pc;
  }, []);

  const restartPeer = useCallback((targetSocketId) => {
    const pc = peerConnections.current.get(targetSocketId);
    const restartState = iceRestartStates.current.get(targetSocketId);
    if (!pc || !restartState || restartState.pending) return;
    if (restartState.attempts >= MAX_ICE_RESTART_ATTEMPTS) {
      console.warn(`ICE recovery attempts exhausted for participant ${targetSocketId}. Check TURN configuration or network connectivity.`);
      return;
    }

    restartState.pending = true;
    restartState.attempts += 1;
    const attempt = restartState.attempts;
    restartState.timer = setTimeout(async () => {
      restartState.timer = null;
      if (pc.connectionState === 'connected') {
        restartState.pending = false;
        restartState.attempts = 0;
        return;
      }

      try {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        socketService.sendOffer(targetSocketId, pc.localDescription);
      } catch (err) {
        restartState.pending = false;
        console.warn(`ICE restart offer failed for participant ${targetSocketId}:`, err);
        if (attempt < MAX_ICE_RESTART_ATTEMPTS) {
          restartState.retryTimer = setTimeout(() => {
            restartState.retryTimer = null;
            restartPeerRef.current?.(targetSocketId);
          }, 1500);
        }
        return;
      }

      restartState.retryTimer = setTimeout(() => {
        restartState.retryTimer = null;
        restartState.pending = false;
        if (pc.connectionState === 'failed') {
          restartPeerRef.current?.(targetSocketId);
        }
      }, 8000);
    }, attempt * 750);
  }, []);
  restartPeerRef.current = restartPeer;

  const shouldInitiateOffer = useCallback((remoteSocketId) => {
    const localSocketId = socketService.getSocketId();
    return Boolean(localSocketId && localSocketId.localeCompare(remoteSocketId) < 0);
  }, []);

  const startPeerOffer = useCallback(async (targetSocketId, remoteUser) => {
    const pc = createPeerConnection(targetSocketId, remoteUser);
    if (pc.signalingState !== 'stable') return;

    try {
      await syncLocalTracks(pc, localStreamRef.current);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.sendOffer(targetSocketId, pc.localDescription);
    } catch (err) {
      console.warn(`Could not start media connection with ${remoteUser?.name || targetSocketId}:`, err);
    }
  }, [createPeerConnection, syncLocalTracks]);

  // Connect socket and register WebRTC signaling events when in-meeting
  useEffect(() => {
    if (!session?.roomId) return;

    socketService.connect();

    // 1. Existing peers already in room
    const handleRoomPeers = async ({ peers }) => {
      for (const peer of peers) {
        setRemotePeers((prev) => {
          if (prev.some((item) => item.socketId === peer.socketId)) return prev;
          const peerUserId = peer.user?.id;
          const base = peerUserId ? prev.filter((item) => item.user?.id !== peerUserId) : prev;
          return [...base, {
            socketId: peer.socketId,
            user: peer.user || { name: 'Participant' },
            stream: null,
            isMuted: peer.isMuted,
            isVideoOff: peer.isVideoOff,
            isHandRaised: peer.isHandRaised,
          }];
        });
        createPeerConnection(peer.socketId, peer.user);
        if (shouldInitiateOffer(peer.socketId)) {
          await startPeerOffer(peer.socketId, peer.user);
        }
      }
    };

    // 2. New user joined
    const handleUserJoined = ({ socketId, user }) => {
      console.log('👤 [WebRTC] New user joined:', user.name);
      setRemotePeers((prev) => {
        if (prev.some((peer) => peer.socketId === socketId)) return prev;
        const joinedUserId = user?.id;
        const base = joinedUserId ? prev.filter((peer) => peer.user?.id !== joinedUserId) : prev;
        return [...base, {
          socketId,
          user: user || { name: 'Participant' },
          stream: null,
          isMuted: Boolean(user?.isMuted),
          isVideoOff: Boolean(user?.isVideoOff),
          isHandRaised: false,
        }];
      });
      createPeerConnection(socketId, user);
      if (shouldInitiateOffer(socketId)) {
        void startPeerOffer(socketId, user);
      }
    };

    // 3. Received Offer
    const handleOffer = async ({ senderSocketId, user, offer }) => {
      const pc = createPeerConnection(senderSocketId, user);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await syncLocalTracks(pc, localStreamRef.current);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketService.sendAnswer(senderSocketId, answer);
        const queuedCandidates = pendingIceCandidates.current.get(senderSocketId) || [];
        for (const candidate of queuedCandidates) {
          await pc.addIceCandidate(candidate);
        }
        pendingIceCandidates.current.delete(senderSocketId);
      } catch (err) {
        console.warn('Handle offer error:', err);
      }
    };

    // 4. Received Answer
    const handleAnswer = async ({ senderSocketId, answer }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          const queuedCandidates = pendingIceCandidates.current.get(senderSocketId) || [];
          for (const candidate of queuedCandidates) {
            await pc.addIceCandidate(candidate);
          }
          pendingIceCandidates.current.delete(senderSocketId);
        } catch (err) {
          console.warn('Handle answer error:', err);
        }
      }
    };

    // 5. Received ICE Candidate
    const handleIceCandidate = async ({ senderSocketId, candidate }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc && candidate) {
        try {
          const iceCandidate = new RTCIceCandidate(candidate);
          if (pc.remoteDescription) {
            await pc.addIceCandidate(iceCandidate);
          } else {
            const queued = pendingIceCandidates.current.get(senderSocketId) || [];
            queued.push(iceCandidate);
            pendingIceCandidates.current.set(senderSocketId, queued);
          }
        } catch (err) {
          console.warn('Add ICE candidate error:', err);
        }
      }
    };

    const handleIceRestartRequest = ({ senderSocketId }) => {
      const localSocketId = socketService.getSocketId();
      if (localSocketId && localSocketId < senderSocketId) {
        restartPeer(senderSocketId);
      }
    };

    // 6. User Left
    const handleUserLeft = ({ socketId }) => {
      const pc = peerConnections.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(socketId);
      }
      const restartState = iceRestartStates.current.get(socketId);
      if (restartState?.timer) clearTimeout(restartState.timer);
      if (restartState?.retryTimer) clearTimeout(restartState.retryTimer);
      iceRestartStates.current.delete(socketId);
      pendingIceCandidates.current.delete(socketId);
      remoteStreams.current.delete(socketId);
      setRemotePeers((prev) => prev.filter((p) => p.socketId !== socketId));
    };

    const handleParticipantMediaState = ({ socketId, isMuted, isVideoOff }) => {
      setRemotePeers((prev) => prev.map((peer) => peer.socketId === socketId
        ? { ...peer, isMuted, isVideoOff }
        : peer));
    };

    socketService.on('room-peers', handleRoomPeers);
    socketService.on('user-joined', handleUserJoined);
    socketService.on('webrtc-offer', handleOffer);
    socketService.on('webrtc-answer', handleAnswer);
    socketService.on('webrtc-ice-candidate', handleIceCandidate);
    socketService.on('ice-restart-request', handleIceRestartRequest);
    socketService.on('user-left', handleUserLeft);
    socketService.on('participant-media-state', handleParticipantMediaState);

    return () => {
      socketService.off('room-peers', handleRoomPeers);
      socketService.off('user-joined', handleUserJoined);
      socketService.off('webrtc-offer', handleOffer);
      socketService.off('webrtc-answer', handleAnswer);
      socketService.off('webrtc-ice-candidate', handleIceCandidate);
      socketService.off('ice-restart-request', handleIceRestartRequest);
      socketService.off('user-left', handleUserLeft);
      socketService.off('participant-media-state', handleParticipantMediaState);

      // Close all peer connections
      peerConnections.current.forEach((pc, socketId) => {
        const restartState = iceRestartStates.current.get(socketId);
        if (restartState?.timer) clearTimeout(restartState.timer);
        if (restartState?.retryTimer) clearTimeout(restartState.retryTimer);
        pc.close();
      });
      peerConnections.current.clear();
      iceRestartStates.current.clear();
      pendingIceCandidates.current.clear();
      remoteStreams.current.clear();
      setRemotePeers([]);
    };
  }, [session?.roomId, createPeerConnection, restartPeer, shouldInitiateOffer, startPeerOffer, syncLocalTracks]);

  // Update tracks when localStream changes (e.g. mic/cam toggle, screen share)
  useEffect(() => {
    peerConnections.current.forEach((pc) => {
      syncLocalTracks(pc, localStream).catch((err) => {
        console.warn('Could not synchronize local media tracks:', err);
      });
    });
  }, [localStream, syncLocalTracks]);

  return {
    remotePeers,
  };
}
