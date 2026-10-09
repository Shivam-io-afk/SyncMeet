| BUG ID | Title | Severity | Status | Root Cause | Solution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BUG-001` | Rapid Microphone Re-request / STT Loop | Medium | `FIXED & VERIFIED` | `SpeechRecognition.onend` was re-invoking `.start()` synchronously without debounce; `useSpeechToText` was active in the Lobby alongside `getUserMedia`. | Added 600ms debounce backoff timer in `useSpeechToText`, added `isEnabled: Boolean(session)` guard so STT only activates inside meeting, and decoupled `enumerateDevices` in `useMediaDevices`. |
| `BUG-002` | Camera Not Rendering / Stream Binding Failure | High | `FIXED & VERIFIED` | 1. `videoRef.current.srcObject` was only attached on stream change, causing black screens when `<video>` remounted on state changes. 2. `getUserMedia` threw on strict resolution/frameRate constraints if camera was occupied or unsupported. | 1. Implemented instant callback ref (`setVideoRef`) that immediately binds `srcObject` and calls `.play()`. 2. Added multi-tier fallback cascade in `useMediaDevices` (Tier 1 exact -> Tier 2 lenient -> Tier 3 audio-only fallback). |

---

## Static & Runtime Audit Checklist
- [x] **Compiler & Bundler**: Vite 6.0.7 production build passed (Exit code: 0).
- [x] **Memory Leak Protection**: Web Audio `AudioContext` closes on unmount; MediaStream tracks stop immediately on exit.
- [x] **Feedback Loop Prevention**: Local `<video>` elements are strictly muted (`muted={isLocal}`).
- [x] **Speech Recognition Resilience**: Auto-reconnect on silent pauses; graceful fallback on unsupported browsers.
- [x] **Gemini API Safety**: Fallback heuristic when API key is unconfigured, preventing crash or blank state.

## Workflow Review Follow-up

- Meeting refresh restores the current room's locally saved transcript and AI notes; transcript clearing also deletes the room's persisted local entries.
- Leaving or ending a meeting saves its server-side history before the local meeting state is cleared. Remote participants save their own history when the host ends the meeting.
- Captions display the latest received participant caption even when this participant's microphone transcription is paused.
- Sidebar panels retain their state while switching tabs or closing the sidebar. Whiteboard drawing supports pointer and touch input.
- The meeting workspace stacks on small screens, and its control dock can scroll horizontally.
- Failed peer connections make up to two coordinated ICE-restart attempts. TURN relay configuration and cross-network media testing remain deployment requirements.
- Camera controls show an explicit loading/unavailable state, and retry camera acquisition when no video track is present.

The follow-up changes passed `npm run check` and workspace diagnostics. Browser smoke testing confirmed transcript persistence across refresh and persistent deletion after clearing; real multi-network WebRTC recovery was not exercised.
