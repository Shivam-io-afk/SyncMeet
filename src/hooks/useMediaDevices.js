import { useState, useEffect, useRef, useCallback } from 'react';

const MESH_VIDEO_CONSTRAINTS = {
  width: { ideal: 640, max: 640 },
  height: { ideal: 360, max: 360 },
  frameRate: { ideal: 24, max: 24 },
};

export function useMediaDevices({ enabled = true } = {}) {
  const [stream, setStream] = useState(null);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [permissionError, setPermissionError] = useState(null);
  const [isLoading, setIsLoading] = useState(enabled);

  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isAcquiringRef = useRef(false);
  const isMountedRef = useRef(false);
  const streamRequestIdRef = useRef(0);
  const isStartingScreenShareRef = useRef(false);

  useEffect(() => {
    stream?.getAudioTracks().forEach((track) => { track.enabled = !isAudioMuted; });
    stream?.getVideoTracks().forEach((track) => { track.enabled = !isVideoDisabled; });
  }, [stream, isAudioMuted, isVideoDisabled]);

  // Enumerate input devices safely
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!isMountedRef.current) return;
      
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
    } catch (err) {
      console.warn('Error enumerating devices:', err);
    }
  }, []);

  // Multi-tier resilient stream acquisition
  const startStream = useCallback(async (audioId = selectedAudioId, videoId = selectedVideoId) => {
    if (isAcquiringRef.current) return;
    isAcquiringRef.current = true;
    const requestId = ++streamRequestIdRef.current;
    setIsLoading(true);
    setPermissionError(null);

    try {
      // Stop existing tracks safely
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setStream(null);
      }

      let userStream = null;
      let acquisitionError = null;
      let videoUnavailable = false;

      // Tier 1: Try with preferred/selected device constraints
      try {
        const constraints = {
          audio: audioId ? { deviceId: { exact: audioId } } : true,
          video: {
            ...MESH_VIDEO_CONSTRAINTS,
            ...(videoId ? { deviceId: { exact: videoId } } : {}),
          },
        };
        userStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err1) {
        console.warn('Tier 1 exact media constraints failed, attempting Tier 2 lenient fallback:', err1);

        // Tier 2: Try basic audio + video without deviceId restrictions
        try {
          userStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { ...MESH_VIDEO_CONSTRAINTS },
          });
        } catch (err2) {
          console.warn('Tier 2 audio+video failed, attempting Tier 3 audio-only fallback:', err2);

          // Tier 3: Try audio only if camera is unavailable/busy
          try {
            userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            videoUnavailable = true;
          } catch (err3) {
            console.error('All media acquisition tiers failed:', err3);
            acquisitionError = err3.name || 'PermissionDeniedError';
          }
        }
      }

      if (!isMountedRef.current || streamRequestIdRef.current !== requestId) {
        userStream?.getTracks().forEach(track => track.stop());
        return;
      }

      if (userStream) {
        streamRef.current = userStream;
        setStream(userStream);
        setPermissionError(null);
        userStream.getTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (streamRef.current !== userStream) return;
            if (track.kind === 'audio') {
              const hasLiveAudio = userStream.getAudioTracks().some((item) => item.readyState === 'live');
              if (!hasLiveAudio) setIsAudioMuted(true);
              setPermissionError('AudioCaptureError');
            } else if (track.kind === 'video') {
              const hasLiveVideo = userStream.getVideoTracks().some((item) => item.readyState === 'live');
              if (!hasLiveVideo) setIsVideoDisabled(true);
              setPermissionError('VideoCaptureError');
            }
          }, { once: true });
        });

        // Apply initial mute/video disable preferences
        userStream.getAudioTracks().forEach(track => { track.enabled = !isAudioMuted; });
        userStream.getVideoTracks().forEach(track => { track.enabled = !isVideoDisabled && !videoUnavailable; });

        // If no video track was acquired, mark video disabled
        setIsVideoDisabled(videoUnavailable || userStream.getVideoTracks().length === 0);

        await refreshDevices();
      } else if (acquisitionError) {
        setPermissionError(acquisitionError);
        setIsAudioMuted(true);
        setIsVideoDisabled(true);
      }
    } catch (err) {
      console.error('Unexpected media stream setup failure:', err);
      if (isMountedRef.current && streamRequestIdRef.current === requestId) {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setStream(null);
        setPermissionError(err.name || 'MediaError');
        setIsVideoDisabled(true);
      }
    } finally {
      if (streamRequestIdRef.current === requestId) {
        setIsLoading(false);
        isAcquiringRef.current = false;
      }
    }
  }, [selectedAudioId, selectedVideoId, isAudioMuted, isVideoDisabled, refreshDevices]);

  const startStreamRef = useRef(startStream);
  startStreamRef.current = startStream;

  useEffect(() => {
    isMountedRef.current = true;
    if (enabled) {
      startStreamRef.current();
    } else {
      setIsLoading(false);
    }

    const handleDeviceChange = () => {
      if (!enabled) return;
      const activeStream = streamRef.current;
      if (activeStream?.getTracks().some((track) => track.readyState === 'ended')) {
        void startStreamRef.current();
      }
      void refreshDevices();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      isMountedRef.current = false;
      streamRequestIdRef.current += 1;
      isAcquiringRef.current = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
    };
  }, [enabled, refreshDevices]);

  // Toggle Audio Track without re-requesting stream
  const toggleAudio = useCallback(() => {
    const audioTracks = streamRef.current?.getAudioTracks()
      .filter((track) => track.readyState === 'live') || [];
    if (!audioTracks.length && isAudioMuted) {
      setPermissionError('AudioCaptureError');
      return;
    }
    const newMuted = !isAudioMuted;
    audioTracks.forEach((track) => { track.enabled = !newMuted; });
    setIsAudioMuted(newMuted);
  }, [isAudioMuted]);

  const setAudioMuted = useCallback((muted) => {
    if (typeof muted !== 'boolean') return;
    const audioTracks = streamRef.current?.getAudioTracks()
      .filter((track) => track.readyState === 'live') || [];
    if (!muted && audioTracks.length === 0) {
      setPermissionError('AudioCaptureError');
      setIsAudioMuted(true);
      return;
    }
    audioTracks.forEach((track) => { track.enabled = !muted; });
    setIsAudioMuted(muted);
  }, []);

  // Toggle Video Track
  const toggleVideo = useCallback(async () => {
    const videoTracks = streamRef.current?.getVideoTracks() || [];

    if (videoTracks.length > 0) {
      const newDisabled = !isVideoDisabled;
      videoTracks.forEach(track => {
        track.enabled = !newDisabled;
      });
      setIsVideoDisabled(newDisabled);
      return;
    }

    setIsLoading(true);
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...MESH_VIDEO_CONSTRAINTS,
          ...(selectedVideoId ? { deviceId: { exact: selectedVideoId } } : {}),
        },
      });
      if (!isMountedRef.current) {
        videoStream.getTracks().forEach(track => track.stop());
        return;
      }
      const newVideoTrack = videoStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error('No camera track was returned by the browser.');

      const tracks = streamRef.current?.getTracks() || [];
      const combinedStream = new MediaStream([...tracks, newVideoTrack]);
      streamRef.current = combinedStream;
      setStream(combinedStream);
      setIsVideoDisabled(false);
      setPermissionError(null);
      await refreshDevices();
    } catch (err) {
      console.warn('Could not acquire video track on toggle:', err);
      if (isMountedRef.current) setIsVideoDisabled(true);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [isVideoDisabled, selectedVideoId, refreshDevices]);

  const setVideoDisabled = useCallback((disabled) => {
    if (typeof disabled !== 'boolean') return;
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !disabled; });
    setIsVideoDisabled(disabled);
  }, []);

  const stopScreenShare = useCallback(() => {
    const displayStream = screenStreamRef.current;
    screenStreamRef.current = null;
    if (isMountedRef.current) {
      setScreenStream(null);
      setIsScreenSharing(false);
    }
    displayStream?.getTracks().forEach((track) => {
      if (track.readyState !== 'ended') track.stop();
    });
  }, []);

  const stopLocalMedia = useCallback(() => {
    streamRequestIdRef.current += 1;
    isAcquiringRef.current = false;
    const localStream = streamRef.current;
    const displayStream = screenStreamRef.current;
    streamRef.current = null;
    screenStreamRef.current = null;
    localStream?.getTracks().forEach((track) => track.stop());
    displayStream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setScreenStream(null);
    setIsScreenSharing(false);
  }, []);

  const resumeLocalMedia = useCallback(() => startStreamRef.current(), []);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      stopScreenShare();
      return;
    }
    if (isStartingScreenShareRef.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.warn('Screen sharing is not supported by this browser.');
      return;
    }

    isStartingScreenShareRef.current = true;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true,
      });
      if (!isMountedRef.current) {
        displayStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) {
        displayStream.getTracks().forEach((track) => track.stop());
        throw new Error('The selected display did not provide a video track.');
      }

      screenStreamRef.current = displayStream;
      setScreenStream(displayStream);
      setIsScreenSharing(true);
      videoTrack.addEventListener('ended', () => {
        if (screenStreamRef.current === displayStream) stopScreenShare();
      }, { once: true });
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        console.warn('Could not start screen sharing:', err);
      }
    } finally {
      isStartingScreenShareRef.current = false;
    }
  }, [stopScreenShare]);

  // Switch Audio Device
  const switchAudioDevice = useCallback((deviceId) => {
    setSelectedAudioId(deviceId);
    startStream(deviceId, selectedVideoId);
  }, [selectedVideoId, startStream]);

  // Switch Video Device
  const switchVideoDevice = useCallback((deviceId) => {
    setSelectedVideoId(deviceId);
    startStream(selectedAudioId, deviceId);
  }, [selectedAudioId, startStream]);

  return {
    stream,
    screenStream,
    audioDevices,
    videoDevices,
    selectedAudioId,
    selectedVideoId,
    isAudioMuted,
    isVideoDisabled,
    isScreenSharing,
    permissionError,
    isLoading,
    toggleAudio,
    setAudioMuted,
    toggleVideo,
    setVideoDisabled,
    toggleScreenShare,
    stopLocalMedia,
    resumeLocalMedia,
    switchAudioDevice,
    switchVideoDevice,
    retryStream: startStream,
  };
}
