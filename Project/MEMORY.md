## Current State
* **Current Phase**: Development prototype; production integrations and multi-user authorization remain incomplete.
* **Product**: SyncMeet AI — browser-based meeting client with WebRTC, local history, captions, chat, and optional server-side AI.
* **Tech Stack**: React 18, Vite 6, Tailwind CSS, Lucide Icons, Web Audio API, Web Speech API, server-side Gemini 2.5 Flash, IndexedDB (`SyncMeetDB`), Express/Socket.IO.
* **Development**: Start frontend and backend together with `npm run dev:all`; use `npm run check` for backend syntax validation and the production client build.

## Key Decisions Made
* **ADR-001**: Direct in-stream audio transcription rather than bot-based recording to minimize friction, latency, and awkward participant bloat.
* **ADR-002**: Split-panel layout: Left 70% video grid + spotlight, Right 30% tabbed sidebar (Live Transcript, AI Notes, Room Chat, Ask AI).
* **ADR-003**: AI Summaries structured into standard categories: Executive Summary, Key Decisions, Action Items (with assignees & priorities), Open Questions.
* **ADR-004 (UX Architecture)**: Implemented dual-stage Pre-Meeting Device Setup with mic visualizer to ensure zero-surprise joining experience. Keyboard shortcuts enabled for instant accessibility (Spacebar push-to-talk, Ctrl+D mute).
* **ADR-005 (Design Tokens)**: Implemented deep dark canvas (`#0A0D14`) with glassmorphic floating dock, emerald active-speaker pulsing ring, and indigo AI accents. Responsive collapse to bottom sheet on mobile.
* **ADR-006 (Technical Architecture)**: Multi-stage pipeline separating Web Audio RMS analysis, streaming speech recognition, and structured Gemini Flash JSON schema extraction with local resilient fallbacks.
* **ADR-007 (Database Architecture)**: IndexedDB client (`SyncMeetDB`) stores local rooms, transcripts, and notes; local persistence is not a guarantee of zero data loss.
* **ADR-008 (Authentication & Identity)**: Local development supports demo profiles; Google OAuth uses a server-side authorization-code exchange and verified Google profile. Production requires a connected database and matching Google Cloud Console origins/callback configuration. Other social providers and email OTP delivery are not implemented.

## Constraints & Rules
* Never block the main thread with heavy audio processing.
* Graceful fallback when microphone or camera permissions are denied or unsupported.
* Keep Gemini and MongoDB credentials on the server; browser assets must not contain secrets.
* Cloud database connectivity is configured with `MONGODB_URI` and reported by `/api/health`; IndexedDB provides the local meeting cache.
* Do not describe the current prototype as production-ready: OAuth/email integrations and server-authoritative room/host permissions are still missing.

## DO NOT TOUCH WITHOUT REASON
* WebRTC media stream tracks lifecycle & cleanup listeners (to prevent camera/mic staying active in background).