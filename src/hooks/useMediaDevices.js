import { useState, useEffect, useRef, useCallback } from 'react';

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
          video: videoId ? { deviceId: { exact: videoId } } : true,
        };
        userStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err1) {
        console.warn('Tier 1 exact media constraints failed, attempting Tier 2 lenient fallback:', err1);

        // Tier 2: Try basic audio + video without deviceId restrictions
        try {
          userStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
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

        // Apply initial mute/video disable preferences
        userStream.getAudioTracks().forEach(track => { track.enabled = !isAudioMuted; });
        userStream.getVideoTracks().forEach(track => { track.enabled = !isVideoDisabled && !videoUnavailable; });

        // If no video track was acquired, mark video disabled
        setIsVideoDisabled(videoUnavailable || userStream.getVideoTracks().length === 0);

        await refreshDevices();
      } else if (acquisitionError) {
        setPermissionError(acquisitionError);
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
      if (enabled) refreshDevices();
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
    if (streamRef.current) {
      const newMuted = !isAudioMuted;
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
      });
      setIsAudioMuted(newMuted);
    } else {
      setIsAudioMuted(prev => !prev);
    }
  }, [isAudioMuted]);

  const setAudioMuted = useCallback((muted) => {
    if (typeof muted !== 'boolean') return;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
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
        video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true,
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
    switchAudioDevice,
    switchVideoDevice,
    retryStream: startStream,
  };
}
