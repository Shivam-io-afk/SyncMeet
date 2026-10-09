# Changelog

All notable changes to the SyncMeet AI backend project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - `backend-improve`

### Phase 0: Safety Net

- **Added**:
  - Pinned devDependencies: `eslint`, `prettier`, `supertest`, `mongodb-memory-server`, `@playwright/test`.
  - `/docs/CONTRACT.md`: Comprehensive mapping of all REST endpoints, Socket.IO client/server events, payloads, and DB collections.
  - `/docs/DECISIONS.md`: Architectural decision records and dependency justifications.
  - Characterization test suite in `test/characterization.test.js` validating baseline behavior of auth, room creation, joining, attendance logging, and meeting conclusion.
- **Changed**:
  - Updated `package.json` with scripts: `lint`, `lint:fix`, `format`, `test:e2e`.
- **Fixed**:
  - Documented complete defect catalog in `/docs/BUGS.md`.
