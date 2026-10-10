import { useState, useEffect, useRef, useCallback } from 'react';

export function getSpeechRecognitionErrorMessage(error) {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Allow microphone access, then turn transcription off and on to retry.';
    case 'audio-capture':
      return 'No microphone is available for transcription. Connect a microphone, then turn transcription off and on to retry.';
    case 'language-not-supported':
      return 'The selected transcription language is not supported by this browser.';
    case 'network':
      return 'Speech recognition lost its network connection. SyncMeet will retry automatically.';
    default:
      return 'Speech recognition encountered an error. Turn transcription off and on to retry.';
  }
}

const FATAL_RECOGNITION_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
]);

/**
 * Browser SpeechRecognition with bounded reconnects and visible failures.
 */
export function useSpeechToText(isMuted = false, localUserName = 'You', isEnabled = false, onTranscript = () => {}) {
  const [transcripts, setTranscripts] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  ));
  const [isListening, setIsListening] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');

  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const isStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const isEnabledRef = useRef(isEnabled);
  const isMutedRef = useRef(isMuted);
  const isFatalErrorRef = useRef(false);
  const retryAttemptsRef = useRef(0);
  const wasEnabledRef = useRef(isEnabled);
  const safeStartRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  isEnabledRef.current = isEnabled;
  isMutedRef.current = isMuted;
  onTranscriptRef.current = onTranscript;

  // Safe start method with state checking
  const safeStart = useCallback(() => {
    if (!recognitionRef.current || !isEnabledRef.current || isMutedRef.current
      || isFatalErrorRef.current || !isMountedRef.current) return;
    if (isStartedRef.current) return;

    try {
      recognitionRef.current.start();
      isStartedRef.current = true;
      setIsListening(true);
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        isFatalErrorRef.current = true;
        setTranscriptionError(getSpeechRecognitionErrorMessage('not-allowed'));
        setIsListening(false);
      } else if (err.name !== 'InvalidStateError') {
        isFatalErrorRef.current = true;
        setTranscriptionError(getSpeechRecognitionErrorMessage('unknown'));
        setIsListening(false);
        console.warn('SpeechRecognition start error:', err);
      }
    }
  }, []);
  safeStartRef.current = safeStart;

  // Safe stop method
  const safeStop = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current && isStartedRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        if (error.name !== 'InvalidStateError') {
          console.warn('SpeechRecognition stop error:', error);
        }
      }
    }
    isStartedRef.current = false;
    setIsListening(false);
    setInterimText('');
  }, []);

  // Initialize the browser recognition instance once per displayed speaker.
  useEffect(() => {
    isMountedRef.current = true;
    const SpeechRecognition = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isStartedRef.current = true;
      if (isMountedRef.current) {
        setIsListening(true);
        setTranscriptionError('');
      }
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalTrimmed = transcriptPart.trim();
          if (finalTrimmed && isMountedRef.current) {
            retryAttemptsRef.current = 0;
            setTranscriptionError('');
            const entry = {
              id: `stt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              speaker: localUserName,
              text: finalTrimmed,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              createdAt: Date.now(),
            };
            setTranscripts((prev) => [...prev, entry]);
            onTranscriptRef.current(entry);
          }
        } else {
          interim += transcriptPart;
        }
      }
      if (isMountedRef.current) {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (FATAL_RECOGNITION_ERRORS.has(event.error)) isFatalErrorRef.current = true;
      if (event.error !== 'network' && !FATAL_RECOGNITION_ERRORS.has(event.error)) {
        isFatalErrorRef.current = true;
      }
      if (event.error === 'network') {
        retryAttemptsRef.current += 1;
      }
      if (!isMountedRef.current) return;
      setTranscriptionError(getSpeechRecognitionErrorMessage(event.error));
      setIsListening(false);
    };

    recognition.onend = () => {
      isStartedRef.current = false;
      if (!isMountedRef.current) return;
      setIsListening(false);
      setInterimText('');

      if (!isEnabledRef.current || isMutedRef.current || isFatalErrorRef.current) return;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      const retryDelay = Math.min(15_000, 600 * (2 ** Math.min(retryAttemptsRef.current, 5)));
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (isMountedRef.current && isEnabledRef.current && !isMutedRef.current
          && !isFatalErrorRef.current && !isStartedRef.current) {
          safeStartRef.current?.();
        }
      }, retryDelay);
    };

    recognitionRef.current = recognition;

    return () => {
      isMountedRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        try {
          recognitionRef.current.abort();
        } catch (error) {
          if (error.name !== 'InvalidStateError') {
            console.warn('SpeechRecognition cleanup error:', error);
          }
        }
        recognitionRef.current = null;
      }
    };
  }, [localUserName]);

  // Sync listen state with isEnabled & isMuted
  useEffect(() => {
    if (!isEnabled || isMuted) {
      safeStop();
    } else {
      if (!wasEnabledRef.current) {
        isFatalErrorRef.current = false;
        retryAttemptsRef.current = 0;
        setTranscriptionError('');
      }
      safeStart();
    }
    wasEnabledRef.current = isEnabled;
  }, [isEnabled, isMuted, safeStart, safeStop]);

  // Method to manually add dialog line
  const addTranscriptEntry = useCallback((speaker, text, timestamp) => {
    const entry = {
      id: `dialog-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      speaker,
      text,
      timestamp: timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      createdAt: Date.now(),
    };
    setTranscripts((prev) => [...prev, entry]);
    return entry;
  }, []);

  const restoreTranscripts = useCallback((savedTranscripts) => {
    setTranscripts((current) => {
      const byId = new Map();
      [...(Array.isArray(savedTranscripts) ? savedTranscripts : []), ...current].forEach((entry) => {
        const id = entry.id || `restored-${entry.createdAt}-${entry.speaker}-${entry.text}`;
        byId.set(id, { ...entry, id });
      });
      return [...byId.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    });
  }, []);

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
    setInterimText('');
  }, []);

  return {
    transcripts,
    interimText,
    isSupported,
    isListening,
    transcriptionError,
    addTranscriptEntry,
    restoreTranscripts,
    clearTranscripts,
  };
}
