# StegoChat — Suggested Next Features

This roadmap is based on the current project setup (Flask backend, browser-based chat UI, image steganography, local JSON chat storage).

## 1) User accounts + authenticated sessions (Highest impact)
**Why:** The app already has a login page, but backend APIs are open and chats are not tied to an authenticated identity.

**What to add:**
- Registration + login APIs (email + password hash)
- Session or JWT auth
- Per-user chat ownership and access checks
- Logout + session expiration

**Outcome:** Turns the app from demo-style chat into a private multi-user system.

---

## 2) Real-time messaging with WebSockets
**Why:** Chat updates currently require manual refresh/load patterns.

**What to add:**
- Flask-SocketIO (or migration path to FastAPI + websockets)
- Real-time events: `message:new`, `chat:created`, `chat:updated`
- Read receipts and typing indicators

**Outcome:** App feels like a modern messenger instead of a static uploader.

---

## 3) End-to-end encryption for message payloads
**Why:** There is password-based stego extraction, but no full E2EE model for chat message lifecycle.

**What to add:**
- Client-side encryption before upload
- Key exchange model for private/group chats
- Optional forward secrecy rotation per chat/session

**Outcome:** Security model becomes explicit and trustworthy.

---

## 4) Group stego messages with role-based controls
**Why:** Group chat UI is present, but permission and membership management can be expanded.

**What to add:**
- Group roles: owner/admin/member
- Add/remove member flows
- Restrict who can post stego media
- Group-level chat password rotation

**Outcome:** Group collaboration becomes manageable at scale.

---

## 5) Stronger steganography presets + quality controls
**Why:** Different images and use-cases need different concealment strength.

**What to add:**
- “Low detectability / Balanced / High capacity” preset selector
- Capacity estimator before embedding
- Automatic fallback if message exceeds safe capacity
- Image quality comparison preview

**Outcome:** Better user trust and fewer failed embeds.

---

## 6) Message TTL + self-destruct that is enforced server-side
**Why:** UI has self-destruct intent, but lifecycle should be authoritative on backend.

**What to add:**
- Per-message expiration timestamp
- Periodic cleanup job for expired files/messages
- "Burn after read" mode for one-time extraction

**Outcome:** Privacy promises become enforceable.

---

## 7) Search, filters, and audit-friendly chat history export
**Why:** As chats grow, discovery and portability become essential.

**What to add:**
- Search by peer, date range, keyword in metadata
- Filter by message type (image-only, protected-only)
- Export chat log as encrypted JSON bundle

**Outcome:** Better usability for active users.

---

## 8) Abuse protection + content safety guardrails
**Why:** Public-facing upload services need abuse controls.

**What to add:**
- Rate limiting per IP/account
- Max file size/type validation
- Basic malware and metadata sanitization pipeline
- Optional report/block workflow

**Outcome:** Safer and more reliable production deployment.

---

## 9) Deployment-grade observability
**Why:** Troubleshooting encrypted/stego workflows is hard without telemetry.

**What to add:**
- Structured logs with request IDs
- Metrics dashboard (embeds, extract failures, latency)
- Error monitoring integration (Sentry)

**Outcome:** Easier operations and faster debugging.

---

## 10) Mobile-first UX and PWA support
**Why:** Stego chat is highly mobile-centric.

**What to add:**
- Responsive media workflow for camera/gallery input
- PWA install + offline cache for static assets
- Push notifications for incoming chats

**Outcome:** Better adoption and daily retention.

---

## Suggested implementation order (practical)
1. Auth + user-bound data model
2. Real-time events
3. E2EE model
4. Server-enforced self-destruct lifecycle
5. Group controls
6. Search/export
7. Abuse protection
8. Observability
9. Mobile/PWA polish

