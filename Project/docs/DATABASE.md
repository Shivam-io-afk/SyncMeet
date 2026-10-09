# DATABASE.md — MongoDB Atlas & Relational Schemas

> Runtime status: IndexedDB provides local browser history. MongoDB persistence is optional and only available when the backend has a valid `MONGODB_URI` and can connect; this document's schemas and examples do not imply a deployed or verified cloud database.

## 1. Multi-Tier Database Architecture
SyncMeet AI implements an active dual-tier storage strategy:
1. **Tier 1 (Instant Local Store — IndexedDB)**: Provides sub-millisecond offline caching, local meeting recovery, and zero server roundtrips.
2. **Tier 2 (Cloud Production Database — MongoDB Atlas)**: Centralized cloud synchronization across multi-user teams, permanent cloud meeting archives, and team transcripts.

---

## 2. Server Environment Configuration (`.env`)
Database credentials must only be configured in the backend environment. Do not use `VITE_` variables for credentials: Vite embeds those values into public browser assets.

```env
# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# MongoDB Atlas Cloud Database Configuration
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/syncmeet_db?retryWrites=true&w=majority

# Application Configuration
JWT_SECRET=replace_with_a_long_random_secret
PORT=5000
```

---

## 3. MongoDB Atlas Document Collections & Schemas

### `rooms` Collection
```json
{
  "_id": "room_a7b9c1",
  "roomId": "room-a7b9c1",
  "title": "Sprint Review & Architecture",
  "hostName": "Sarah Jenkins",
  "hostId": "user_sarah_01",
  "isLocked": false,
  "settings": {
    "allowScreenShare": true,
    "allowAINotes": true
  },
  "participantCount": 3,
  "createdAt": "2026-10-08T09:00:00.000Z",
  "syncedAt": "2026-10-08T09:00:01.000Z"
}
```

### `transcripts` Collection
```json
{
  "_id": "ObjectId('...')",
  "roomId": "room-a7b9c1",
  "speaker": "Alex Chen",
  "text": "Approved using MongoDB Atlas with mongoose schemas for user persistent session storage.",
  "timestamp": "09:14:22 AM",
  "createdAt": "2026-10-08T09:14:22.000Z"
}
```

### `ai_notes` Collection
```json
{
  "_id": "note-room-a7b9c1",
  "roomId": "room-a7b9c1",
  "summary": "The team aligned on MongoDB Atlas cloud integration and Google Meet feature parity...",
  "decisions": [
    "Approved MongoDB Atlas cloud dual-synchronization.",
    "Integrated live closed captions and collaborative whiteboard."
  ],
  "actionItems": [
    {
      "task": "Deploy MongoDB Atlas cluster and set connection URI",
      "assignee": "Alex Chen",
      "priority": "High",
      "isCompleted": false
    }
  ],
  "openQuestions": [
    "Will Atlas App Services triggers be configured for email digests?"
  ],
  "updatedAt": "2026-10-08T09:20:00.000Z"
}
```

### `chat_messages` Collection
```json
{
  "_id": "ObjectId('...')",
  "roomId": "room-a7b9c1",
  "senderId": "user_sarah_01",
  "senderName": "Sarah Jenkins",
  "text": "Check the new whiteboard canvas in tab 4!",
  "timestamp": "09:16:00 AM",
  "createdAt": "2026-10-08T09:16:00.000Z"
}
```

---

## 4. Connecting to Your MongoDB Atlas Cluster
1. Set `MONGODB_URI` in the backend `.env` file or deployment environment.
2. Restart the backend and check `GET /api/health` (or the in-app database status dialog) for the MongoDB connection status.
3. Meeting history is submitted to the backend when the meeting ends. Browser IndexedDB remains the local cache.

Never enter a MongoDB URI in the browser. Browser-side Atlas configuration is not supported; the old dialog's simulated connection check did not connect to MongoDB and has been replaced with a backend health check.
