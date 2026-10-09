# SyncMeet AI Bug Catalog & Defect Tracking

This document tracks all identified architectural and functional defects, categorized by severity (P0–P3), with exact file locations, reproduction steps, root cause analysis, proposed fixes, and resolution statuses.

---

## Defect Summary

| Bug ID | Severity | Title | File & Line | Status |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | **P0** | Participant disappears on page reload due to immediate disconnect broadcast | `server/socket/socketHandler.js:936-946` | **OPEN** |
| **BUG-002** | **P0** | Missing REST endpoint `GET /api/rooms/:roomId/state` for state rehydration on reload/rejoin | `server/routes/roomRoutes.js:160` | **OPEN** |
| **BUG-003** | **P1** | `MeetingAttendance` unique compound index includes `socketId`, creating duplicate attendance on rejoin | `server/models/MeetingAttendance.js:14`, `server/socket/socketHandler.js:350-367` | **OPEN** |
| **BUG-004** | **P1** | Non-host authenticated users assigned random `guest-` IDs on room join | `server/routes/roomRoutes.js:139-140` | **OPEN** |
| **BUG-005** | **P1** | Video tile keying in frontend uses `peer.socketId` instead of stable `userId` | `src/components/meeting/MeetingRoom.jsx:49-58` | **OPEN** |
| **BUG-007** | **P2** | In-memory presence cache in `memoryMeetingStore` can desynchronize from MongoDB | `server/socket/socketHandler.js:51-101`, `server/store/memoryMeetingStore.js` | **OPEN** |
| **BUG-008** | **P0** | Meeting archives / DB archives leaks previous users' local IndexedDB records to new accounts | `src/components/history/MeetingHistoryModal.jsx`, `src/services/dbService.js` | **FIXED** |

---

## Detailed Bug Reports

### BUG-001: Participant Disappears on Page Reload Due to Immediate Disconnect Broadcast
- **Severity**: **P0 (Critical Blocker)**
- **File & Line**: [`server/socket/socketHandler.js:936-946`](file:///c:/WEB/React/Reat2.0/server/socket/socketHandler.js#L936-L946)
- **Reproduction Steps**:
  1. Open Host browser window and create an instant meeting room.
  2. Open Participant browser window and join the room with the room ID.
  3. Verify both video tiles appear and WebRTC audio/video is streaming.
  4. In the Participant browser window, press Refresh (F5 / Ctrl+R).
  5. **Observe**: The participant tile immediately disappears from the host's screen, and after page reload finishes, the user often sees an empty room or fails to reconnect with their original identity.
- **Root Cause**:
  In `server/socket/socketHandler.js`:
  ```javascript
  socket.on('disconnect', async () => {
    // ...
    if (socket.roomId && rooms.has(socket.roomId)) {
      const roomMap = rooms.get(socket.roomId);
      roomMap.delete(socket.id); // Immediate deletion!
      if (roomMap.size === 0) {
        rooms.delete(socket.roomId);
      } else {
        socket.to(socket.roomId).emit('user-left', { // Immediate broadcast!
          socketId: socket.id,
          user: socket.user,
        });
      }
    }
  });
  ```
  There is zero grace period. When the browser refreshes, the WebSocket connection closes before the new page mounts. The server immediately purges the user from the room map and broadcasts `user-left`.
- **Proposed Fix**:
  1. Introduce a Reconnection Grace Period Manager in `socketHandler.js` (20-second timeout).
  2. On socket disconnect:
     - Mark participant status as `'disconnected'`.
     - Schedule a 20s timeout before deleting from room or broadcasting `user-left`.
  3. On `join-room`:
     - If the joining user matches an existing participant in grace period (matched by stable `userId`), cancel the timer, update `socketId`, and emit `room-peers` without notifying peers of a departure.

---

### BUG-002: Missing REST Endpoint `GET /api/rooms/:roomId/state` for State Rehydration on Rejoin
- **Severity**: **P0 (Critical Blocker)**
- **File & Line**: [`server/routes/roomRoutes.js:160`](file:///c:/WEB/React/Reat2.0/server/routes/roomRoutes.js#L160)
- **Reproduction Steps**:
  1. User joins an active meeting with custom agenda, active breakout, and lock status.
  2. User reloads the page.
  3. Client checks `sessionStorage` but has no way to query the authoritative live state of the meeting from the backend before re-emitting socket events.
- **Root Cause**:
  `server/routes/roomRoutes.js` only exposes `GET /:roomId`, which returns static room metadata (title, hostName, settings). It does **not** return the current list of active participants, their media states, lock status, active breakout session, or caller role.
- **Proposed Fix**:
  Implement `GET /api/rooms/:roomId/state`:
  - Guard with `requireRoomAccess`.
  - Fetch room metadata, participants from `Room.participants`, lock status, and active breakout session from MongoDB.
  - Return `{ success: true, state: { room, participants, isLocked, activeBreakout, role } }`.
  - In `App.jsx`, call this endpoint on mount when a saved session exists to rehydrate room state before socket connection.

---

### BUG-003: `MeetingAttendance` Unique Index Includes `socketId`, Duplicating Records on Rejoin
- **Severity**: **P1 (High Severity)**
- **File & Line**: [`server/models/MeetingAttendance.js:14`](file:///c:/WEB/React/Reat2.0/server/models/MeetingAttendance.js#L14), [`server/socket/socketHandler.js:350-367`](file:///c:/WEB/React/Reat2.0/server/socket/socketHandler.js#L350-L367)
- **Reproduction Steps**:
  1. Log in and join a meeting.
  2. Refresh the browser 3 times.
  3. Query `MeetingAttendance.find({ roomId, userId })` in MongoDB.
  4. **Observe**: 4 separate attendance records exist for the same user in the same meeting.
- **Root Cause**:
  `meetingAttendanceSchema.index({ roomId: 1, userId: 1, socketId: 1 }, { unique: true });`
  Because `socketId` is in the unique key, every new socket connection generates an independent attendance record instead of updating the existing session.
- **Proposed Fix**:
  Change index to `{ roomId: 1, userId: 1 }` (unique for active attendance where `leftAt: null`).
  Update `MeetingAttendance.findOneAndUpdate` to query `{ roomId, userId }` so rejoining updates `socketId` and clears `leftAt`.

---

### BUG-004: Non-Host Authenticated Users Assigned Random `guest-` IDs on Room Join
- **Severity**: **P1 (High Severity)**
- **File & Line**: [`server/routes/roomRoutes.js:139-140`](file:///c:/WEB/React/Reat2.0/server/routes/roomRoutes.js#L139-L140)
- **Reproduction Steps**:
  1. Log in as a registered user (e.g., Alex Chen).
  2. Join a meeting hosted by another user.
  3. Inspect `res.data.participant.id` returned by `POST /api/rooms/:roomId/join`.
  4. **Observe**: The participant ID is `guest-<randomUUID>` rather than the user's stable account ID.
- **Root Cause**:
  ```javascript
  const isHost = Boolean(req.user && room?.hostId && String(req.user.id || req.user._id) === String(room.hostId));
  const participantId = isHost ? String(req.user.id || req.user._id) : `guest-${randomUUID()}`;
  ```
  The ternary only uses `req.user.id` if `isHost` is true! If an authenticated user joins as a participant, their user ID is replaced with a random guest ID.
- **Proposed Fix**:
  Use the authenticated user's ID whenever `req.user` exists:
  ```javascript
  const participantId = req.user
    ? String(req.user.id || req.user._id)
    : (req.body?.participantId || `guest-${randomUUID()}`);
  ```

---

### BUG-005: Video Tile Keying in Frontend Uses `peer.socketId` Instead of Stable `userId`
- **Severity**: **P1 (High Severity)**
- **File & Line**: [`src/components/meeting/MeetingRoom.jsx:49-58`](file:///c:/WEB/React/Reat2.0/src/components/meeting/MeetingRoom.jsx#L49-L58)
- **Reproduction Steps**:
  1. Host and participant are in a meeting.
  2. Participant reconnects with a new socket ID.
  3. Host sees two tiles for the same participant during the transition because tiles are keyed by `peer.socketId`.
- **Root Cause**:
  ```javascript
  const displayParticipants = remotePeers.map((peer) => ({
    id: peer.socketId,
    // ...
  }));
  ```
- **Proposed Fix**:
  Key participants by `peer.user?.id || peer.socketId`. In `useWebRTC.js` and `MeetingRoom.jsx`, ensure any peer update for an existing `userId` replaces the old peer entry.

---

### BUG-006: Client Meeting-Scoped `sessionStorage` Not Validated Against Active URL / Room Transitions
- **Severity**: **P2 (Medium Severity)**
- **File & Line**: [`src/App.jsx:20-55`](file:///c:/WEB/React/Reat2.0/src/App.jsx#L20-L55), [`src/services/apiService.js:46-55`](file:///c:/WEB/React/Reat2.0/src/services/apiService.js#L46-L55)
- **Reproduction Steps**:
  1. Join Meeting 1 (`room-111`).
  2. Change URL or navigate to join Meeting 2 (`room-222`).
  3. `sessionStorage` retains tokens from `room-111` and mixes them into the headers for `room-222`.
- **Root Cause**:
  `sessionStorage` stores room access tokens globally under `syncmeet_active_room_id_v1` without checking if the active room changed.
- **Proposed Fix**:
  Clear meeting-scoped storage on meeting leave, and validate that `activeRoomId` matches before injecting `X-Room-Access-Token`.

---

### BUG-007: In-Memory Presence Cache in `memoryMeetingStore` Can Desynchronize from MongoDB
- **Severity**: **P2 (Medium Severity)**
- **File & Line**: [`server/socket/socketHandler.js:51-101`](file:///c:/WEB/React/Reat2.0/server/socket/socketHandler.js#L51-L101), [`server/store/memoryMeetingStore.js`](file:///c:/WEB/React/Reat2.0/server/store/memoryMeetingStore.js)
- **Reproduction Steps**:
  1. Update media states, polls, and breakouts.
  2. If MongoDB reconnection happens mid-meeting, memory store state is not rehydrated from MongoDB.
- **Root Cause**:
  MongoDB is the intended source of truth, but `socketHandler.js` reads from `inMemoryRooms` or collections inconsistently without a unified write-through and cache-invalidation policy.
- **Proposed Fix**:
  Enforce MongoDB as the primary source of truth with write-through cache semantics. Rehydrate in-memory presence maps from MongoDB on room activation.

---

### BUG-008: Meeting Archives / DB Archives Leaks Previous Users' Local IndexedDB Records to New Accounts
- **Severity**: **P0 (Critical Security & Privacy Defect)**
- **File & Line**: [`src/components/history/MeetingHistoryModal.jsx:17-90`](file:///c:/WEB/React/Reat2.0/src/components/history/MeetingHistoryModal.jsx#L17-L90), [`src/services/dbService.js:278-305`](file:///c:/WEB/React/Reat2.0/src/services/dbService.js#L278-L305), [`src/services/cryptoAuthService.js:612-619`](file:///c:/WEB/React/Reat2.0/src/services/cryptoAuthService.js#L612-L619)
- **Reproduction Steps**:
  1. User A logs in on a browser, creates a meeting room, adds transcripts and AI notes, and saves/leaves.
  2. User A signs out.
  3. User B (or any new user) registers or logs in on the same computer.
  4. User B clicks the **"DB Archives"** button in the lobby.
  5. **Observe**: User B sees User A's past meetings in their list, and clicking on them exposes User A's private transcripts and AI notes.
- **Root Cause**:
  1. In `dbService.getMeetingHistory()`, when an authenticated user called `apiService.getRecentMeetings()`, the code appended `extraLocal = localRooms.filter(r => !cloudRoomIds.has(r.roomId))` from IndexedDB (`SyncMeetDB`), which held all unpartitioned meetings from previous browser sessions.
  2. `MeetingHistoryModal.jsx` called `dbService.getMeetingHistory()` instead of querying the authenticated user's cloud account records directly, and fell back to `dbService.getRoomMeetingData(roomId)` if `getAccountHistory` failed.
  3. `cryptoAuthService.signOut()` and `signIn()` did not clear local IndexedDB meeting cache upon account transitions.
- **Resolution**: **FIXED**
  1. Modified `src/services/dbService.js`: Removed `extraLocal` leakage; authenticated users now strictly receive only their own cloud meetings (`mergedCloudRooms`). Added `clearAllLocalData()` to wipe IndexedDB on account switch.
  2. Modified `src/components/history/MeetingHistoryModal.jsx`: When authenticated (`isAccount || apiService.getToken()`), loads strictly from `apiService.getRecentMeetings()` and `apiService.getAccountHistory()`. Never falls back to foreign local cache.
  3. Modified `src/services/cryptoAuthService.js`: Calls `dbService.clearAllLocalData()` upon `signOut()`, `signIn()`, and `signUp()`.
  4. Added automated regression tests:
     - Integration test in `test/storageAndDbBridge.test.js` asserting zero cross-account history leakage.
     - Playwright E2E browser test in `e2e/archivesIsolation.spec.js` asserting User B never sees User A's meetings in "DB Archives".


