# API Reference

Base URL: `/api` · Interactive docs: `/api/docs` (Swagger) and `/api/redoc`.

All authenticated endpoints expect `Authorization: Bearer <access_token>`.

## Auth

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | `{username, email, password}` | Returns `{user, tokens}`. 201. |
| POST | `/auth/login` | `{identifier, password}` | `identifier` = username **or** email. |
| POST | `/auth/refresh` | `{refresh_token}` | Rotates the refresh token. |
| POST | `/auth/logout` | `{refresh_token}` | Revokes the token. Auth required. |

`tokens` = `{access_token, refresh_token, token_type, expires_in}`.

## User & settings (auth required)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/user` | — | Current user. |
| PUT | `/user` | `{username?, email?, bio?, avatar?}` | Update profile. |
| POST | `/user/password` | `{old_password, new_password}` | Revokes all sessions. |
| DELETE | `/user` | — | Delete account + all data. |
| GET | `/settings` | — | Theme/accent/animations/etc. |
| PUT | `/settings` | partial settings | Update. |

## Steganography (auth required)

| Method | Path | Body (multipart) | Notes |
|--------|------|------|-------|
| POST | `/embed` | `message, password, image?|sample?, decoy_message?, decoy_password?, create_dead_drop?, dead_drop_ttl_hours?` | Returns stego URL, optional dead-drop token. |
| POST | `/extract` | `image, password` | Returns hidden text **or** recovered file. |
| POST | `/eof-embed` | `cover, payload, password` | Hide an arbitrary file. |
| POST | `/eof-extract` | `stego, password` | Recover the file. |
| POST | `/scan-risk` | `{message}` (JSON) | Flags sensitive content. |
| POST | `/forensics` | `image` | Entropy + LSB anomaly report. |
| GET | `/capacity` | `image` | Max payload bytes for a cover. |
| GET | `/samples` | — | Built-in cover images. |

## History (auth required)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/history?q=&favorites_only=&folder=&limit=&offset=` | Search/list chats. |
| POST | `/history` | Create a chat. |
| GET | `/history/{id}` | Chat detail + messages. |
| PATCH | `/history/{id}` | Rename / pin / favorite / move folder. |
| DELETE | `/history/{id}` | Delete a chat (and its stego files). |
| DELETE | `/history` | Clear all history. |

## Dashboard (auth required)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/dashboard` | Stats + recent activity + 7-day embed series. |
| GET | `/stats` | Stats only. |

## Dead drops

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/dead-drop` | ✅ | `{message, password, ttl_hours, burn_after_read}` → token. |
| POST | `/dead-drop/{token}` | ❌ | `{password}` → message; burns on read. |
| GET | `/dead-drop/{token}/info` | ❌ | Metadata without consuming. |

## Files

| Method | Path | Notes |
|--------|------|-------|
| GET | `/files/{name}` | Generated stego images / extracted payloads. |
| GET | `/samples/{name}` | Sample cover images. |

## Meta

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Liveness probe. |

## Errors

Errors return `{"detail": "..."}`. Validation errors (422) add an `errors` array.
Rate-limited requests return **429**.
