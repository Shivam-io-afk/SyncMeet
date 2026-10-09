# Architecture Decisions & Dependency Log

This document records architectural decisions, technical justifications, and dependency choices for the SyncMeet AI backend improvement.

---

## Phase 0: Safety Net Dependencies

| Package                 | Version | Type              | One-Line Justification                                                                                                         |
| :---------------------- | :------ | :---------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `eslint`                | pinned  | `devDependencies` | Static code analysis to enforce code quality, clean standards, and prevent syntax/scoping regressions.                         |
| `prettier`              | pinned  | `devDependencies` | Opinionated automated code formatting to ensure consistency across JavaScript and JSX files.                                   |
| `supertest`             | pinned  | `devDependencies` | HTTP assertion library allowing characterization testing of Express endpoints without manually managing ports.                 |
| `mongodb-memory-server` | pinned  | `devDependencies` | In-memory MongoDB instance for fast, isolated, deterministic database integration tests without external network dependencies. |
| `@playwright/test`      | pinned  | `devDependencies` | Cross-browser multi-context end-to-end automation for verifying host/participant real-time WebRTC and UI lifecycles.           |

---

## Architectural Principles & Rules

1. **Database as Single Source of Truth**:
   MongoDB Atlas is the canonical store for all persistent meeting data (rooms, users, sessions, attendance, polls, Q&A, breakouts, agendas, notes).
2. **Ephemeral / Presence Cache**:
   Redis (via `ioredis` with an in-memory fallback for local dev without `REDIS_URL`) manages fast real-time presence, reconnect grace period timers, and Socket.IO cluster broadcast adapters.
3. **Zero `localStorage` Policy**:
   No meeting-scoped state or tokens may be stored in `localStorage`. Meeting session state lives exclusively in `sessionStorage` and is validated against authoritative server state.
4. **Stable Identity Over Socket ID**:
   All participants, video tiles, and attendance records are keyed by stable `userId` (or persistent guest ID), never ephemeral `socket.id`.
