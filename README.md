# SyncMeet AI

SyncMeet AI is a React/Vite meeting client with an Express/Socket.IO backend. The app uses browser IndexedDB for local meeting history, WebRTC for peer media, and optional MongoDB persistence through the backend.

## Requirements

- Node.js 20 or newer
- npm
- Optional: a MongoDB instance and a Gemini API key

## Local development

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set a strong `JWT_SECRET`. Set `MONGODB_URI` and `GEMINI_API_KEY` if using the corresponding backend services.
4. Start both services with `npm run dev:all`.
5. Open the Vite URL printed by the development server (normally `http://localhost:3000`). To test from another device on the same network, open the app with this computer's LAN IP and allow Node/Vite through the firewall. The backend health endpoint is `http://localhost:5000/api/health`.

The backend can run without MongoDB; in that mode, server-side meeting archives and feature data are held in memory and are lost when the process restarts. The meeting history UI also stores its archives in browser IndexedDB. MongoDB credentials must stay in the server environment and must never use a `VITE_` prefix.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite frontend |
| `npm run server` | Start the Express/Socket.IO backend |
| `npm run dev:all` | Start frontend and backend together |
| `npm run build` | Create the production frontend bundle in `dist/` |
| `npm run check` | Syntax-check backend files and build the frontend |
| `npm run preview` | Preview the production frontend bundle |
| `npm start` | Start the backend, which serves `dist/` when it exists |

For a production build, run `npm run build` before `npm start`. Configure `PORT`, `NODE_ENV=production`, `JWT_SECRET`, `MONGODB_URI`, `CORS_ORIGINS`, and `GEMINI_API_KEY` in the deployment environment as needed. Production authentication requires a reachable MongoDB database; the in-memory fallback is for local development only.

## Configuration and privacy

- `.env.example` contains placeholders only. Keep the populated `.env` file local.
- `MONGODB_URI` is read by the backend only. The `/api/health` endpoint reports whether the backend can reach the database; database credentials are never entered into the browser.
- Access tokens expire after `JWT_ACCESS_EXPIRES_IN` (15 minutes by default). Login and registration also set a rotating, HttpOnly refresh cookie whose lifetime is controlled by `JWT_REFRESH_EXPIRES_IN` (7 days by default). Refresh sessions are stored in MongoDB as token hashes and can be revoked by logout or logout-all. Configure a random `JWT_SECRET` of at least 32 characters in production.
- Set `CORS_ORIGINS` to the exact comma-separated frontend origins used in production. Cross-site production refresh cookies require HTTPS and `SameSite=None; Secure`; `COOKIE_DOMAIN` is optional and should only be set when the frontend and API share a parent domain. If deployed behind a reverse proxy, set `TRUST_PROXY_HOPS` to the actual trusted proxy hop count so secure-cookie and client-IP handling work correctly.
- `/health` and `/api/health` expose readiness; production returns 503 while MongoDB is disconnected. API and authentication request limits can be adjusted with `API_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX`. Their default in-memory store is process-local, so use a shared rate-limit store when running multiple server instances.
- `GEMINI_API_KEY` is the server-side key used by backend summarization. Do not add secret keys under `VITE_*`; Vite embeds those values in the public client bundle.
- Without server-side Gemini configuration, the backend returns a labeled local heuristic summary. If a configured Gemini request fails or returns invalid data, the API reports an error; the frontend may then use its explicitly labeled local heuristic.
- Google sign-in uses a server-side authorization-code flow and requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_FRONTEND_ORIGIN`, and a connected database in production. For local development, add `http://localhost:3000` as an authorized JavaScript origin and `http://localhost:3000/auth/google/callback` as an authorized redirect URI in Google Cloud Console. GitHub/Microsoft sign-in and email OTP delivery are not implemented.
- Keep `GOOGLE_CLIENT_SECRET` only in the ignored server `.env` or deployment secret store; never prefix it with `VITE_` or include it in client builds.
- Shared meeting links use the current app origin. `localhost` links only work on the computer running the app. Use the Vite network URL (and allow it through the firewall) for same-network testing, or set `VITE_PUBLIC_APP_URL` to the public/LAN app origin when links need a fixed shareable address. Restart Vite after changing this value. HTTP LAN origins use a clipboard fallback because the browser Clipboard API may require HTTPS.
- Audio and video are processed by the browser for the live meeting. Live transcription uses the browser's Web Speech API, whose recognition service may be provided by the browser vendor; captions can be hidden without stopping transcription. Avoid sharing private meeting content unless the relevant service is configured and permitted.
- Live transcription can be paused or resumed from the in-meeting controls. It uses the local microphone when unmuted; muting the microphone pauses recognition, and turning transcription off stops it independently of caption visibility.

## Production limitations

This repository still needs end-to-end deployment validation before being treated as a hosted multi-user meeting service. Google OAuth is verified server-side when configured; GitHub/Microsoft OAuth and email OTP delivery are not implemented. Meeting APIs and host Socket.IO controls use server-issued, room-scoped, 12-hour access tickets, including for anonymous guests; never treat client-supplied role flags as authority. MongoDB and Gemini require valid deployment configuration. WebRTC has bounded ICE-restart attempts but no configured TURN relay, and Socket.IO room state is process-local, so restrictive networks and multi-instance deployments require additional infrastructure. The API has process-local request rate limits; production operations still need shared rate-limit storage, monitoring, backups, and deployment validation.

The active room tab restores its locally stored transcript and AI notes after a page refresh. Clearing transcript history removes the current room's locally stored transcript entries. The host can save a room-scoped server archive at meeting end; it includes transcripts and notes and requires the host's room ticket. With MongoDB connected, archives are stored in the database; without it, archive data is process-local and is lost on restart. Browser IndexedDB history remains available on that device.

## Meeting planning and collaboration

- Schedule a future meeting from the lobby with a built-in standup, planning, retrospective, discovery, or general agenda template. The form uses the browser's local time zone; schedule records persist in MongoDB when connected and otherwise remain in the running server's memory.
- Scheduled meetings can be shared with a room link or downloaded as an `.ics` calendar invite with a 10-minute calendar reminder. SyncMeet does not send invitation emails or background push notifications.
- In a meeting, agenda completion and AI note/action-item updates are saved with `GET`/`PUT /api/features/rooms/:roomId/agenda` and `GET`/`PUT /api/features/rooms/:roomId/notes`. Room-scoped access tickets are required; locked rooms also require host admission before their REST features can be used. Host-only operations additionally verify the ticket's host role. MongoDB stores the shared agenda and one AI-notes document per room; without MongoDB, the server uses an in-memory fallback.
- Authenticated room owners can recover host access by joining with their account token; anonymous guests continue to use the room-specific host ticket saved on their device. Participant names and roles used by Socket.IO come from verified room tickets rather than client-supplied role flags.
- Poll and Q&A socket broadcasts re-read the persisted record before relaying updates. Chat, captions, reactions, and whiteboard events are checked and attributed to the connected ticket identity. Breakout assignments are sourced from the server-created session, and eligible guests can reconnect to an active breakout while its session remains active.
- Hosts can move participants into separate Socket.IO/WebRTC breakout rooms, set a time limit, let participants return early, and bring everyone back when the session ends. Breakout membership is process-local; a process restart loses live room membership even though scheduled meeting and breakout records may persist in MongoDB.
- Archive search includes transcript text and speakers as well as titles, summaries, decisions, action items, and open questions. AI notes can be copied or downloaded as Markdown/JSON.

AI endpoints are public and currently covered only by the general API request limit; add abuse monitoring and any needed per-user or provider-cost quotas before public launch. Keep room tickets private and use HTTPS in production. Breakout signaling and fallback storage are process-local and require a shared Socket.IO adapter and durable storage for multi-instance deployment.

## Project notes

The `Project/` directory contains the product requirements, architecture, UX, and backlog documents. Treat these as design intent; runtime behavior and deployment configuration are described here and in `.env.example`.
#   S y n c M e e t  
 