# Technical Architecture — SyncMeet AI

---

> This document describes the prototype architecture, not a production security guarantee. MongoDB and Gemini are optional server integrations; authentication providers and email delivery are incomplete, and Socket.IO room/host actions are not server-authorized.

## 1. End-to-End System Architecture

```
                                  ┌──────────────────────────────────────────┐
                                  │       React + Vite Frontend Client       │
                                  │     Tailwind CSS + Lucide Icons + STT    │
                                  └────────────────────┬─────────────────────┘
                                                       │
                        ┌──────────────────────────────┼──────────────────────────────┐
                        │                              │                              │
                        ▼                              ▼                              ▼
             ┌─────────────────────┐        ┌─────────────────────┐        ┌─────────────────────┐
             │   WebRTC Mesh /     │        │ Socket.io Signaling │        │ Express REST API    │
             │   MediaStream API   │        │ Real-time Events    │        │ JWT Auth & Sessions │
             └──────────┬──────────┘        └──────────┬──────────┘        └──────────┬──────────┘
                        │                              │                              │
                        ▼                              ▼                              ▼
             ┌─────────────────────┐        ┌─────────────────────┐        ┌─────────────────────┐
             │ Multi-Peer Audio &  │        │ Chat, Reactions, CC,│        │ MongoDB Atlas Cloud │
             │ Video Exchange      │        │ Whiteboard Sync     │        │ + IndexedDB Store   │
             └─────────────────────┘        └─────────────────────┘        └─────────────────────┘
```

---

## 2. Technology Stack & Rationale

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 18 + Vite 6** | Instant HMR, minimal bundle size, optimal performance for real-time video/audio state updates. |
| **Backend Framework** | **Node.js + Express 5** | High-concurrency asynchronous API server handling JWT authentication, room lifecycles, and AI proxies. |
| **Real-Time Collaboration** | **Socket.io + WebSockets** | Sub-millisecond latency for WebRTC signaling (offers, answers, ICE), chat, whiteboard strokes, and reactions. |
| **Peer-to-Peer Media** | **WebRTC `RTCPeerConnection` + STUN** | Ultra-low latency video/audio exchange across participants. |
| **Audio Processing** | **Web Audio API (`AudioContext`, `AnalyserNode`)** | Real-time audio frequency visualizer and active speaker highlighting. |
| **Speech-to-Text** | **Web Speech API (`webkitSpeechRecognition`)** | Browser-provided speech recognition; its service may process audio outside the app. |
| **AI Intelligence** | **Optional server-side Gemini API** | Uses the configured model when a key is available; otherwise a transcript-based local fallback is used. |
| **Database & Storage**| **Optional MongoDB (Mongoose) + IndexedDB** | IndexedDB stores local history; cloud persistence is conditional on a working backend database connection. |
| **Authentication** | **Server JWT + bcrypt; Google OAuth authorization-code flow** | Google codes and verified profiles are exchanged server-side. Provider-console configuration is required; GitHub/Microsoft and email delivery are not implemented. Client-side roles must not be treated as authorization. |

---

## 3. Server Endpoints & Data Contracts

### 3.1 Authentication REST API (`/api/auth`)
- `POST /api/auth/register` — Creates user account with bcrypt password hash and returns signed JWT token.
- `POST /api/auth/login` — Verifies email/password and returns JWT token & user profile.
- `GET /api/auth/me` — Validates Bearer JWT header and returns authenticated user data.

### 3.2 Room Lifecycle REST API (`/api/rooms`)
- `POST /api/rooms/create` — Initializes meeting room record with security settings (screen share, AI notes, chat, whiteboard).
- `GET /api/rooms/:roomId` — Fetches room metadata, host information, and active status.

### 3.3 AI Notes & Synthesis REST API (`/api/ai`)
- `POST /api/ai/summarize` — Server-side Gemini synthesis proxy extracting summary, decisions, action items, and open questions.
- `POST /api/ai/ask` — Server-side Gemini meeting Q&A; the API key remains in the backend environment.
- `GET /api/health` — Reports API availability and backend database connection status.

### 3.4 Meeting History REST API (`/api/history`)
- `POST /api/history/save` — Persists meeting archive, transcripts, and AI notes.
- `GET /api/history` — Retrieves saved meeting sessions.

### 3.5 Meeting Planning & Collaboration API (`/api/features`)
- `GET /templates` — Returns the built-in meeting agenda templates.
- `GET/POST /schedules`, `GET/DELETE /schedules/:roomId` — Lists, creates, inspects, and cancels scheduled meetings.
- `GET/PUT /rooms/:roomId/agenda` — Reads and replaces the shared meeting agenda and completion state, persisted in the unique `MeetingAgenda` record for that room.
- `GET/PUT /rooms/:roomId/notes` — Reads and replaces structured notes and action-item completion state, persisted in the unique `AINote` record for that room.
- `GET/POST /rooms/:roomId/polls`, `POST /rooms/:roomId/polls/:pollId/votes`, `PATCH /rooms/:roomId/polls/:pollId/close` — Manages polls and votes.
- `GET/POST /rooms/:roomId/questions`, `POST /rooms/:roomId/questions/:questionId/upvote`, `PATCH /rooms/:roomId/questions/:questionId/answer` — Manages meeting Q&A.
- `GET/POST /rooms/:roomId/breakouts`, `PATCH /rooms/:roomId/breakouts/:breakoutId/end` — Stores breakout room sessions and assignments.
- MongoDB models back durable data; when MongoDB is unavailable, scheduling, notes, polls, Q&A, agendas, and breakout metadata use process-local memory stores that are lost when the server restarts.

Feature routes currently do not enforce participant or host ownership. Host controls use a client-asserted role, matching the prototype's existing behavior; server-side authorization is required before public deployment.

---

## 4. Socket.io Real-Time Protocol & Events

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `join-room` | Client ➔ Server | `{ roomId, user }` | Joins socket room and informs peers |
| `webrtc-offer` | Peer ➔ Peer | `{ targetSocketId, offer }` | WebRTC SDP offer signaling |
| `webrtc-answer` | Peer ➔ Peer | `{ targetSocketId, answer }` | WebRTC SDP answer signaling |
| `webrtc-ice-candidate` | Peer ➔ Peer | `{ targetSocketId, candidate }`| ICE network candidate exchange |
| `send-chat-message` | Client ➔ Room | `{ id, senderId, senderName, text, timestamp }` | In-meeting room chat |
| `send-reaction` | Client ➔ Room | `{ id, emoji, sender, x, duration }` | Floating emoji reaction burst |
| `whiteboard-draw` | Client ➔ Room | `{ x0, y0, x1, y1, color, brushSize, mode }` | Collaborative canvas drawing |
| `whiteboard-clear`| Client ➔ Room | — | Clears collaborative canvas |
| `caption-stream` | Client ➔ Room | `{ speaker, text, timestamp }` | Live closed captions broadcast |
| `toggle-hand-raise`| Client ➔ Room | `{ isHandRaised }` | Hand raise queue status |
| `host-mute-all` | Host ➔ Room | — | Forces mute on all participants |
| `host-lock-room` | Host ➔ Room | `{ isLocked }` | Locks/unlocks room entry |
| `host-end-meeting`| Host ➔ Room | — | Terminates meeting for all users |
| `meeting-poll-updated` | Client ➔ Meeting rooms | `{ roomId, ...poll }` | Broadcasts poll creation, votes, and closure across main and breakout rooms |
| `meeting-question-updated` | Client ➔ Meeting rooms | `{ roomId, ...question }` | Broadcasts Q&A changes and ranking updates |
| `meeting-agenda-updated` | Client ➔ Meeting rooms | `{ agenda }` | Syncs agenda completion and host edits across the meeting |
| `start-breakout` | Host ➔ Server | `{ breakout }` | Moves assigned participants into isolated Socket.IO signaling rooms |
| `end-breakout` | Host ➔ Server | `{ breakoutId }` | Returns breakout participants to the main room; server also returns them at the configured time limit |
| `return-from-breakout` | Participant ➔ Server | — | Returns an individual participant to the main room |
| `breakout-assignment` | Server ➔ Participant | `{ breakoutId, roomId, parentRoomId, groupName, active }` | Moves the participant's WebRTC client to/from a breakout room |