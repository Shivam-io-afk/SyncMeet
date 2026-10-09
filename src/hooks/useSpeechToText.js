import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Production-safe Speech-to-Text hook with loop protection and debounced auto-reconnect
 */
export function useSpeechToText(isMuted = false, localUserName = 'You', isEnabled = false, onTranscript = () => {}) {
  const [transcripts, setTranscripts] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const isStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const isEnabledRef = useRef(isEnabled);
  const isMutedRef = useRef(isMuted);
  const safeStartRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  isEnabledRef.current = isEnabled;
  isMutedRef.current = isMuted;
  onTranscriptRef.current = onTranscript;

  // Safe start method with state checking
  const safeStart = useCallback(() => {
    if (!recognitionRef.current || !isEnabledRef.current || isMutedRef.current || !isMountedRef.current) return;
    if (isStartedRef.current) return;

    try {
      recognitionRef.current.start();
      isStartedRef.current = true;
      setIsListening(true);
    } catch (err) {
      // Ignored if already starting/started
      if (err.name !== 'InvalidStateError') {
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
      } catch (e) {
        // Ignored
      }
    }
    isStartedRef.current = false;
    setIsListening(false);
    setInterimText('');
  }, []);

  // Initialize SpeechRecognition instance once
  useEffect(() => {
    isMountedRef.current = true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

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
      }
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalTrimmed = transcriptPart.trim();
          if (finalTrimmed && isMountedRef.current) {
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
      // Ignore routine non-fatal events like no-speech
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      if (event.error === 'not-allowed') {
        isStartedRef.current = false;
        if (isMountedRef.current) setIsListening(false);
      }
    };

    recognition.onend = () => {
      isStartedRef.current = false;
      if (isMountedRef.current) {
        setIsListening(false);
        setInterimText('');
      }

      // Debounced safe restart (500ms backoff) only if active session and unmuted
      if (isMountedRef.current && isEnabledRef.current && !isMutedRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && isEnabledRef.current && !isMutedRef.current && !isStartedRef.current) {
            safeStartRef.current?.();
          }
        }, 600);
      }
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
        } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, [localUserName]);

  // Sync listen state with isEnabled & isMuted
  useEffect(() => {
    if (!isEnabled || isMuted) {
      safeStop();
    } else {
      safeStart();
    }
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
      [...savedTranscripts, ...current].forEach((entry) => {
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
    addTranscriptEntry,
    restoreTranscripts,
    clearTranscripts,
  };
}
