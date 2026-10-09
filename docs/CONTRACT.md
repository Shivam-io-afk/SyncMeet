# SyncMeet AI Frontend-Backend Contract Specification

This document defines the strict API, Socket.IO, and Database contract between the SyncMeet AI frontend client (`src/`) and backend services (`server/`). All backend improvements must strictly adhere to this contract to avoid breaking client interactions.

---

## 1. REST Endpoints Contract

### 1.1 Authentication & Profile (`/api/auth`)

#### `POST /api/auth/register`

- **Headers**: `Content-Type: application/json`
- **Request Payload**:
  ```json
  {
    "name": "Alex Chen",
    "email": "alex@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Success Response (201 Created)**:
  - Sets HttpOnly Cookie: `syncmeet_refresh=<refreshToken>; Path=/api/auth; SameSite=Strict; HttpOnly`
  ```json
  {
    "success": true,
    "user": {
      "id": "67a9...",
      "name": "Alex Chen",
      "email": "alex@example.com",
      "role": "member",
      "avatar": "",
      "title": "Team Member",
      "avatarColor": "from-indigo-600 to-cyan-500"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "message": "Validation error description" }`
  - `409 Conflict`: `{ "success": false, "message": "Email is already registered" }`
  - `429 Too Many Requests`: `{ "success": false, "message": "Too many attempts" }`

#### `POST /api/auth/login`

- **Headers**: `Content-Type: application/json`
- **Request Payload**:
  ```json
  {
    "email": "alex@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Success Response (200 OK)**:
  - Sets HttpOnly Cookie: `syncmeet_refresh=<refreshToken>; Path=/api/auth; SameSite=Strict; HttpOnly`
  ```json
  {
    "success": true,
    "user": {
      "id": "67a9...",
      "name": "Alex Chen",
      "email": "alex@example.com",
      "role": "member",
      "avatar": "",
      "title": "Team Member",
      "avatarColor": "from-indigo-600 to-cyan-500"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: `{ "success": false, "message": "Invalid email or password" }`

#### `POST /api/auth/refresh`

- **Headers**: `Cookie: syncmeet_refresh=<token>`
- **Request Payload**: None
- **Success Response (200 OK)**:
  - Rotates `syncmeet_refresh` HttpOnly Cookie
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Error Response (401 Unauthorized)**: `{ "success": false, "message": "Invalid or expired session" }`

#### `POST /api/auth/logout`

- **Headers**: `Cookie: syncmeet_refresh=<token>`
- **Request Payload**: None
- **Success Response (200 OK)**:
  - Clears `syncmeet_refresh` HttpOnly Cookie
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

#### `GET /api/auth/me`

- **Headers**: `Authorization: Bearer <jwtAccessToken>`
- **Request Payload**: None
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "67a9...",
      "name": "Alex Chen",
      "email": "alex@example.com",
      "role": "member",
      "avatar": "",
      "title": "Team Member",
      "avatarColor": "from-indigo-600 to-cyan-500"
    }
  }
  ```
- **Error Response (401 Unauthorized)**: `{ "success": false, "message": "Not authorized to access this route" }`

#### `PUT /api/auth/profile`

- **Headers**: `Authorization: Bearer <jwtAccessToken>`, `Content-Type: application/json`
- **Request Payload**:
  ```json
  {
    "name": "Alex Chen",
    "title": "Lead Architect",
    "avatar": "",
    "avatarColor": "from-emerald-600 to-teal-500"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "67a9...",
      "name": "Alex Chen",
      "title": "Lead Architect",
      "avatar": "",
      "avatarColor": "from-emerald-600 to-teal-500"
    }
  }
  ```

---

### 1.2 Room Lifecycle & Rehydration (`/api/rooms`)

#### `POST /api/rooms/create`

- **Headers**: `Authorization: Bearer <jwtAccessToken>`, `Content-Type: application/json`
- **Request Payload**:
  ```json
  {
    "roomId": "room-uuid-or-custom",
    "title": "Architecture Review",
    "settings": {
      "isMutedOnEntry": false,
      "isVideoOffOnEntry": false,
      "isScreenShareAllowed": true,
      "isChatAllowed": true
    }
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "room": {
      "roomId": "room-uuid-or-custom",
      "title": "Architecture Review",
      "hostId": "67a9...",
      "hostName": "Alex Chen",
      "isLocked": false,
      "settings": { ... },
      "createdAt": "2026-10-09T06:00:00.000Z"
    },
    "accessToken": "signed-room-token-with-role-host"
  }
  ```

#### `POST /api/rooms/guest`

- **Headers**: `Content-Type: application/json` (Optional `Authorization: Bearer <token>`)
- **Request Payload**:
  ```json
  {
    "title": "Ad-Hoc Discussion",
    "hostName": "Guest Host"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "room": {
      "roomId": "room-generated-uuid",
      "title": "Ad-Hoc Discussion",
      "hostName": "Guest Host",
      "isLocked": false
    },
    "accessToken": "signed-room-token-with-role-host"
  }
  ```

#### `POST /api/rooms/:roomId/join`

- **Headers**: `Content-Type: application/json` (Optional `Authorization: Bearer <token>`)
- **Request Payload**:
  ```json
  {
    "name": "Participant Name",
    "participantId": "optional-stored-session-id"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "participant": {
      "id": "stable-user-or-guest-id",
      "name": "Participant Name"
    },
    "accessToken": "signed-room-access-token",
    "role": "participant",
    "requiresAdmission": false
  }
  ```
- **Error Response**: `404 Not Found` if room does not exist or `isActive === false`.

#### `GET /api/rooms/:roomId`

- **Headers**: `X-Room-Access-Token: <roomAccessToken>`
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "room": {
      "roomId": "room-123",
      "title": "Weekly Sync",
      "hostName": "Alex Chen",
      "isLocked": false,
      "settings": { ... },
      "agenda": [],
      "isActive": true,
      "createdAt": "..."
    }
  }
  ```

#### `GET /api/rooms/:roomId/state` (Authoritative Rehydration)

- **Headers**: `X-Room-Access-Token: <roomAccessToken>`
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "state": {
      "roomId": "room-123",
      "title": "Weekly Sync",
      "hostId": "host-user-id",
      "hostName": "Alex Chen",
      "isLocked": false,
      "isActive": true,
      "createdAt": "...",
      "agenda": [],
      "settings": { ... },
      "participants": [
        {
          "userId": "user-1",
          "name": "Alex Chen",
          "role": "host",
          "isMuted": false,
          "isVideoOff": false,
          "isDisconnected": false,
          "joinedAt": "..."
        }
      ],
      "caller": {
        "participantId": "user-1",
        "role": "host",
        "isHost": true,
        "displayName": "Alex Chen"
      },
      "activeBreakout": null
    }
  }
  ```

---

### 1.3 Meeting Features & Collaboration (`/api/features`)

| Endpoint                                             | Method   | Headers                                   | Payload                                                     | Response                                                                       |
| :--------------------------------------------------- | :------- | :---------------------------------------- | :---------------------------------------------------------- | :----------------------------------------------------------------------------- |
| `/api/features/templates`                            | `GET`    | None                                      | None                                                        | `{ success: true, templates: [...] }`                                          |
| `/api/features/schedules`                            | `GET`    | None                                      | None                                                        | `{ success: true, meetings: [...] }`                                           |
| `/api/features/schedules`                            | `POST`   | `Authorization: Bearer <jwt>`             | `{ title, startsAt, duration, timezone, invitees, agenda }` | `{ success: true, meeting: { ... } }`                                          |
| `/api/features/schedules/:roomId`                    | `GET`    | Optional `X-Room-Access-Token` if private | None                                                        | `{ success: true, meeting: { ... } }`                                          |
| `/api/features/schedules/:roomId`                    | `DELETE` | `X-Room-Access-Token` (Host only)         | None                                                        | `{ success: true, message: "Meeting cancelled" }`                              |
| `/api/features/rooms/:roomId/notes`                  | `GET`    | `X-Room-Access-Token`                     | None                                                        | `{ success: true, notes: { summary, decisions, actionItems, openQuestions } }` |
| `/api/features/rooms/:roomId/notes`                  | `PUT`    | `X-Room-Access-Token`                     | `{ summary, decisions, actionItems, openQuestions }`        | `{ success: true, notes: { ... } }`                                            |
| `/api/features/rooms/:roomId/agenda`                 | `GET`    | `X-Room-Access-Token`                     | None                                                        | `{ success: true, agenda: [...] }`                                             |
| `/api/features/rooms/:roomId/agenda`                 | `PUT`    | `X-Room-Access-Token`                     | `{ agenda: [{ id, title, duration, isCompleted }] }`        | `{ success: true, agenda: [...] }`                                             |
| `/api/features/rooms/:roomId/polls`                  | `GET`    | `X-Room-Access-Token`                     | None                                                        | `{ success: true, polls: [...] }`                                              |
| `/api/features/rooms/:roomId/polls`                  | `POST`   | `X-Room-Access-Token`                     | `{ question, options, allowMultiple }`                      | `{ success: true, poll: { id, question, options, ... } }`                      |
| `/api/features/rooms/:roomId/polls/:pollId/votes`    | `POST`   | `X-Room-Access-Token`                     | `{ optionIds: ["opt-1"] }`                                  | `{ success: true, poll: { ... } }`                                             |
| `/api/features/rooms/:roomId/polls/:pollId/close`    | `PATCH`  | `X-Room-Access-Token` (Host only)         | None                                                        | `{ success: true, poll: { ... } }`                                             |
| `/api/features/rooms/:roomId/questions`              | `GET`    | `X-Room-Access-Token`                     | None                                                        | `{ success: true, questions: [...] }`                                          |
| `/api/features/rooms/:roomId/questions`              | `POST`   | `X-Room-Access-Token`                     | `{ text, isAnonymous }`                                     | `{ success: true, question: { id, text, authorName, votes: 0, answers: [] } }` |
| `/api/features/rooms/:roomId/questions/:qId/upvote`  | `POST`   | `X-Room-Access-Token`                     | None                                                        | `{ success: true, question: { ... } }`                                         |
| `/api/features/rooms/:roomId/questions/:qId/answers` | `POST`   | `X-Room-Access-Token`                     | `{ text }`                                                  | `{ success: true, question: { ... } }`                                         |
| `/api/features/rooms/:roomId/breakouts`              | `POST`   | `X-Room-Access-Token` (Host only)         | `{ groupCount, durationMinutes, assignments }`              | `{ success: true, session: { id, groups, endsAt } }`                           |
| `/api/features/rooms/:roomId/breakouts/active`       | `GET`    | `X-Room-Access-Token`                     | None                                                        | `{ success: true, session: { ... } }`                                          |
| `/api/features/rooms/:roomId/breakouts/active/close` | `POST`   | `X-Room-Access-Token` (Host only)         | None                                                        | `{ success: true, message: "Breakouts closed" }`                               |

---

### 1.4 History & Archives (`/api/history`)

| Endpoint                           | Method | Auth / Headers                | Description & Payload                                                                         |
| :--------------------------------- | :----- | :---------------------------- | :-------------------------------------------------------------------------------------------- |
| `POST /api/history/:roomId/save`   | `POST` | `X-Room-Access-Token` (Host)  | Saves archive snapshot: `{ title, transcripts, aiNotes }`. Upserts `Transcript` and `AINote`. |
| `GET /api/history/:roomId`         | `GET`  | `X-Room-Access-Token`         | Retrieves archived meeting records, transcripts, and notes for the room.                      |
| `GET /api/history/account/recent`  | `GET`  | `Authorization: Bearer <jwt>` | Returns meeting archives belonging exclusively to the authenticated account.                  |
| `GET /api/history/account/:roomId` | `GET`  | `Authorization: Bearer <jwt>` | Returns full details of an account meeting archive with verified ownership.                   |

---

## 2. Real-Time Socket.IO Protocol Contract

### 2.1 Connection Handshake & Authentication

- **Transport**: `['websocket', 'polling']`
- **Handshake Verification**: Socket joins require valid `X-Room-Access-Token` or payload `accessToken`.

### 2.2 Client-to-Server Events

| Event Name             | Payload Schema                                                     | Description                                                             |
| :--------------------- | :----------------------------------------------------------------- | :---------------------------------------------------------------------- |
| `join-room`            | `{ roomId, user: { id, name, isMuted, isVideoOff }, accessToken }` | Requests joining the meeting room. Rejoin updates socket reference.     |
| `update-media-state`   | `{ isMuted: boolean, isVideoOff: boolean }`                        | Updates microphone and camera state for local user.                     |
| `send-chat-message`    | `{ id, text, timestamp }`                                          | Broadcasts chat message to meeting attendees and stores in chat buffer. |
| `send-reaction`        | `{ id, emoji, sender, x, duration }`                               | Broadcasts floating emoji reaction to all participants.                 |
| `caption-stream`       | `{ speaker, text, timestamp }`                                     | Streams live speech-to-text transcript caption to peers.                |
| `raise-hand`           | `{ isHandRaised: boolean }`                                        | Toggles hand raise indicator.                                           |
| `knock-room`           | `{ roomId, user: { id, name, email }, accessToken }`               | Knocks on a locked room / waiting room.                                 |
| `admit-user`           | `{ applicantSocketId, user }`                                      | (Host only) Admits knocking participant into the room.                  |
| `deny-user`            | `{ applicantSocketId, user }`                                      | (Host only) Denies entrance to knocking applicant.                      |
| `webrtc-offer`         | `{ targetSocketId, offer }`                                        | Transmits WebRTC SDP offer to target peer.                              |
| `webrtc-answer`        | `{ targetSocketId, answer }`                                       | Transmits WebRTC SDP answer to target peer.                             |
| `webrtc-ice-candidate` | `{ targetSocketId, candidate }`                                    | Transmits ICE candidate to peer.                                        |
| `request-ice-restart`  | `{ targetSocketId }`                                               | Requests an ICE restart from remote peer.                               |
| `host-mute-all`        | None                                                               | (Host only) Commands all remote participants to mute audio.             |
| `host-toggle-lock`     | `{ isLocked: boolean }`                                            | (Host only) Locks or unlocks the room.                                  |
| `host-end-meeting`     | None                                                               | (Host only) Terminates the meeting for all attendees.                   |
| `leave-room`           | None                                                               | Explicit intentional departure (cancels grace period, cleans presence). |

### 2.3 Server-to-Client Broadcast Events

| Event Name                | Target         | Payload Schema                                                                     | Trigger                                                           |
| :------------------------ | :------------- | :--------------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| `room-peers`              | Joining socket | `{ peers: [{ socketId, user: { id, name }, isMuted, isVideoOff, isHandRaised }] }` | Sent immediately after joining room.                              |
| `user-joined`             | Room peers     | `{ socketId, user: { id, name, isMuted, isVideoOff } }`                            | Emitted when a new peer joins.                                    |
| `user-reconnected`        | Room peers     | `{ oldSocketId, newSocketId, user: { id, name } }`                                 | Emitted when a peer reconnects within grace period.               |
| `user-disconnected`       | Room peers     | `{ socketId, user: { id, name } }`                                                 | Emitted when a peer drops connection (enters grace period).       |
| `user-left`               | Room peers     | `{ socketId, user: { id, name } }`                                                 | Emitted when a peer intentionally leaves or grace period expires. |
| `room-chat-history`       | Joining socket | `{ messages: [{ id, senderName, text, timestamp }] }`                              | Chat replay sent upon joining.                                    |
| `receive-chat-message`    | Room peers     | `{ id, senderId, senderSocketId, senderName, text, timestamp }`                    | Real-time chat message broadcast.                                 |
| `receive-reaction`        | Room peers     | `{ id, emoji, sender, x, duration }`                                               | Real-time emoji reaction broadcast.                               |
| `caption-stream`          | Room peers     | `{ speaker, text, timestamp }`                                                     | Live transcript subtitle broadcast.                               |
| `participant-media-state` | Room peers     | `{ socketId, isMuted, isVideoOff }`                                                | Remote peer media state update.                                   |
| `room-lock-status`        | Room peers     | `{ isLocked: boolean }`                                                            | Emitted on join and when host toggles room lock.                  |
| `meeting-ended-by-host`   | All attendees  | None                                                                               | Emitted when host clicks "End Meeting for All".                   |
| `host-mute-all-command`   | Non-hosts      | None                                                                               | Emitted when host triggers "Mute All".                            |
| `breakout-assignment`     | Target user    | `{ roomId, parentRoomId, groupName, active: boolean }`                             | Breakout room relocation.                                         |
| `knock-request`           | Host sockets   | `{ applicantSocketId, user: { id, name, email } }`                                 | Notifies host of a waiting participant.                           |
| `knock-response`          | Applicant      | `{ approved: boolean, message: string }`                                           | Notifies applicant of host's admission decision.                  |

---

## 3. Database Models & Schema Contract

| Model Name          | MongoDB Collection   | Key Fields & Types                                                                                                                                                                                                               | Indexes                                                          | Purpose                                               |
| :------------------ | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- | :---------------------------------------------------- |
| `User`              | `users`              | `name: String`, `email: String` (lowercase, unique), `password: String` (hashed), `role: String`, `title: String`, `avatarColor: String`                                                                                         | `{ email: 1 }` (unique)                                          | Authenticated user identity and credentials.          |
| `AuthSession`       | `authsessions`       | `userId: ObjectId`, `refreshTokenHash: String`, `userAgent: String`, `ipAddress: String`, `revokedAt: Date`, `expiresAt: Date`                                                                                                   | `{ refreshTokenHash: 1 }`, `{ userId: 1, revokedAt: 1 }`         | Multi-device session tracking and token rotation.     |
| `Room`              | `rooms`              | `roomId: String` (unique), `title: String`, `hostId: String`, `hostName: String`, `isLocked: Boolean`, `isActive: Boolean`, `attendeeIds: [String]`, `participants: [{ userId, name, socketId, isMuted, isVideoOff, joinedAt }]` | `{ roomId: 1 }` (unique), `{ hostId: 1 }`, `{ isActive: 1 }`     | Authoritative meeting room state and participants.    |
| `MeetingAttendance` | `meetingattendances` | `roomId: String`, `userId: String`, `socketId: String`, `title: String`, `hostName: String`, `role: String`, `joinedAt: Date`, `leftAt: Date`                                                                                    | `{ roomId: 1, userId: 1 }` (unique), `{ userId: 1, leftAt: -1 }` | Deduplicated per-user meeting attendance log.         |
| `MeetingAgenda`     | `meetingagendas`     | `roomId: String`, `items: [{ id, title, duration, isCompleted }]`                                                                                                                                                                | `{ roomId: 1 }` (unique)                                         | Meeting agenda items and completion status.           |
| `MeetingPoll`       | `meetingpolls`       | `roomId: String`, `question: String`, `options: [{ id, text, votes }]`, `voters: [{ userId, optionIds }]`, `isClosed: Boolean`                                                                                                   | `{ roomId: 1 }`                                                  | In-meeting interactive polling and real-time tallies. |
| `MeetingQuestion`   | `meetingquestions`   | `roomId: String`, `authorId: String`, `authorName: String`, `text: String`, `votes: [String]`, `answers: [{ authorName, text, createdAt }]`                                                                                      | `{ roomId: 1 }`                                                  | Q&A questions, upvotes, and host/peer answers.        |
| `BreakoutSession`   | `breakoutsessions`   | `roomId: String`, `id: String`, `status: String` (active/ended), `groups: [{ id, roomId, name, participantIds }]`, `endsAt: Date`                                                                                                | `{ roomId: 1, status: 1 }`                                       | Host-moderated breakout room allocations.             |
| `ScheduledMeeting`  | `scheduledmeetings`  | `roomId: String`, `title: String`, `createdBy: String`, `startsAt: Date`, `duration: Number`, `invitees: [String]`, `status: String`                                                                                             | `{ roomId: 1 }` (unique), `{ startsAt: 1 }`                      | Calendar schedules and access-gated invitations.      |
| `Transcript`        | `transcripts`        | `roomId: String`, `speaker: String`, `text: String`, `timestamp: String`, `source: String`                                                                                                                                       | `{ roomId: 1 }`                                                  | Persistent spoken meeting transcripts.                |
| `AINote`            | `ainotes`            | `roomId: String`, `summary: String`, `decisions: [String]`, `actionItems: [{ task, assignee, priority }]`, `openQuestions: [String]`                                                                                             | `{ roomId: 1 }` (unique)                                         | Summaries, action items, and AI-generated notes.      |
