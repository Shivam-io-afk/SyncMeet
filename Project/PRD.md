# Product Requirements Document (PRD)
# Project: SyncMeet AI — Real-Time Video Meetings with AI Notes & Summaries

---

## 1. Product Vision & Executive Summary
**SyncMeet AI** is a lightweight, real-time video conferencing application with native, in-session AI speech transcription and structured note generation. Unlike legacy tools that require intrusive recording bots to join meetings, SyncMeet AI processes audio streams in real-time, producing automated live transcripts, structured meeting summaries, action items with assignees, and key decisions on a shared collaborative canvas.

---

## 2. Problem Statement & Target Audience
* **Problem**: Meeting participants lose focus by attempting to take notes manually, resulting in missed context, poor post-meeting execution, and lost action items.
* **Target Users**:
  * **Engineering & Product Teams**: Sprint planning, daily standups, technical syncs.
  * **Client Consultants & Agency Leads**: Client discovery calls, requirement gathering.
  * **Recruiters & Interviewers**: Candidate assessments, verbatim interview logs.
  * **Remote Teams & Freelancers**: Async team alignments, project handoffs.

---

## 3. User Personas & Journeys

### Persona 1: Sarah — Lead Product Manager
* **Goal**: Keep meetings short, focused, and immediately distribute action items.
* **Journey**: Creates room link → Invites team → Conducts 20-min sprint refinement → AI highlights blockers & assigns tasks → Sarah reviews live summary, edits 2 bullets, and clicks "Export to Markdown/Clipboard".

### Persona 2: Alex — Senior Full-Stack Engineer
* **Goal**: Participate in architecture discussions without getting distracted typing notes.
* **Journey**: Joins room via link → Speaks technical specs → Views real-time live captions & key terms extracted in the side-panel → Reviews generated technical decisions post-call.

---

## 4. Feature Breakdown by Version

### 🚀 MVP (Phase 1 Focus)
1. **Instant Room Lifecycle**:
   * Generate unique room ID / URL.
   * Instant join with name and device selection (Cam/Mic preview).
2. **Real-Time Video & Audio (WebRTC Mesh / SFU client)**:
   * Multi-participant video grid (2-4 participants).
   * Mute/Unmute audio, Enable/Disable camera, Screen sharing.
   * Active speaker indicator & sound level detection.
3. **Live In-Stream Speech-to-Text (STT)**:
   * Real-time audio stream capture and transcription.
   * Live streaming transcript panel with speaker identification and timestamps.
4. **AI Meeting Notes & Intelligence Engine**:
   * Real-time extraction of:
     * **Executive Summary** (2-3 concise paragraphs).
     * **Key Decisions Made** (bulleted list).
     * **Action Items** (Task + Owner + Priority).
     * **Open Questions / Parking Lot**.
   * One-click "Regenerate / Update Notes" trigger.
5. **Interactive Notes Editor & Export**:
   * Editable markdown notes panel during and after call.
   * "Copy to Clipboard" & "Download as Markdown (.md) / JSON".

### 📦 Version 1.0 (V1)
* User Authentication (Google / GitHub / Magic Link).
* Meeting history dashboard & persistent archive of past meeting notes.
* Searchable transcript archives.
* In-meeting text chat and file sharing.
* Custom AI summary prompts (e.g., "Standup format", "Sales discovery format", "Technical spec format").

### 🔮 Version 2.0 (V2)
* Live multi-language translation and dual-language subtitles.
* Integrations: Push action items to Jira, GitHub Issues, Linear, Slack, or Notion.
* AI Meeting Chatbot ("Ask meeting AI: What did Alex say about database indexing?").
* Server-side Cloud Recording & Audio playback synced to transcript timestamps.

---

## 5. Screen List & Navigation Architecture

```
[ Landing / Lobby Page ]
   ├── Create Instant Meeting → Room View
   ├── Join via Meeting ID / Code → Device Setup Modal → Room View
   └── Meeting History / Past Notes (V1)

[ Room View (/room/:roomId) ]
   ├── Top Bar (Room Name, Timer, Security Badge, Participant Count)
   ├── Main Grid (Responsive Video Tiles, Active Speaker Highlights, Screen Share Spotlight)
   ├── Bottom Dock (Mic, Cam, Screen Share, Live Captions, Notes Toggle, End Call)
   └── Right Sidebar (Tabbed Panel)
         ├── Tab 1: Live Transcript (Streaming text with speaker tags)
         ├── Tab 2: AI Notes & Action Items (Live updating structured markdown)
         └── Tab 3: Chat / Participants
```

---

## 6. Data Requirements & Schemas

### Room Object
```json
{
  "roomId": "room_abc123",
  "title": "Sprint Planning Sync",
  "createdAt": "2026-10-08T09:00:00Z",
  "hostId": "user_host1",
  "participants": [
    { "id": "p1", "name": "Sarah", "isMuted": false, "isVideoOn": true }
  ]
}
```

### Transcript Entry Object
```json
{
  "id": "t_01",
  "speakerId": "p1",
  "speakerName": "Sarah",
  "text": "Let's migrate the authentication layer to OAuth2 by Friday.",
  "timestamp": 1728378000000,
  "confidence": 0.98
}
```

### AI Summary Output Schema
```json
{
  "summary": "The team aligned on migrating authentication to OAuth2 by Friday...",
  "decisions": [
    "Approved migration of auth service to OAuth2."
  ],
  "actionItems": [
    { "task": "Draft OAuth2 migration plan", "assignee": "Alex", "priority": "High" }
  ],
  "openQuestions": [
    "Will legacy session tokens be invalidated immediately?"
  ]
}
```

---

## 7. API & Third-Party Service Requirements
* **Media & WebRTC**: WebRTC PeerConnection with STUN/TURN (or LiveKit SDK / Daily.co client).
* **Transcription (STT)**: Deepgram WebSocket live streaming API / OpenAI Whisper API / Web Speech API.
* **AI Summarization**: Gemini 3.7 Flash API (structured JSON output mode).
* **Storage & Persistence**: LocalStorage / IndexedDB (for MVP) → PostgreSQL/Supabase (for V1).

---

## 8. Non-Functional Requirements & Acceptance Criteria
* **Video/Audio Latency**: Sub-250ms glass-to-glass latency for 1:1 and group media streams.
* **Transcription Latency**: Streaming transcript chunk rendered within 1.2 seconds of speech pause.
* **AI Summary Latency**: Full summary generated in under 3.5 seconds using fast Flash LLM.
* **Accessibility**: Full keyboard accessibility for mute/unmute shortcuts (e.g., Spacebar/Ctrl+D), high-contrast UI, screen-reader friendly captions.
* **Security & Privacy**: Zero server-side persistence of raw audio streams in MVP; clear visual indicator when transcription/AI is active.