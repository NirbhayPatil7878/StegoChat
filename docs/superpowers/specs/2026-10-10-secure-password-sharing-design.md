# Secure Password Sharing Design

## Goal and scope

Let authenticated StegoChat users share a password (including a legacy image
extraction password) with explicitly selected users from a direct or group
conversation. Password plaintext and private keys remain on user devices. The
server stores authenticated ciphertext and recipient-specific wrapped keys,
and enforces recipient, expiry, deletion, one-time-open, and sender-revocation
rules. A password share does not grant access to a conversation image or other
resource; the recipient also needs the corresponding image/carrier.

Password sharing is a separate feature. It does not change text messages,
steganographic image messages, legacy password reveal, decoy messages, login
credentials, or existing message key envelopes.

## Repository audit and constraints

- Conversation membership is represented by `ConversationMember`; authenticated
  routes use `get_current_user` and `_get_membership`.
- Group and direct-message stego flows are both implemented in
  `backend/app/routers/conversations.py`. There is no notification or push
  subsystem. The chat page uses React Query polling.
- Alembic is the production schema path. Development also uses additive
  `create_all` and `_backfill_columns` in `backend/app/database.py`.
- User RSA-OAEP public keys are stored in `users.e2ee_public_key` and can only
  be registered once by `PUT /api/users/e2ee-key`. The registration validates
  RSA key size, but the app does not verify a key's identity with a fingerprint.
- `frontend/src/lib/e2ee.ts` stores an IndexedDB `CryptoKeyPair`. It currently
  creates an extractable RSA pair, exports its private key, then reimports the
  private key as non-extractable before saving it. The private key is not sent
  to the API. The implementation must remove the temporary extractable-private
  step if browser Web Crypto permits exporting the public half of a pair
  generated with a non-extractable private key; this behavior must be verified
  in tests before changing the identity format.
- Current public-key retrieval is conversation-member-only and group-only.
  The existing group message upload validates recipient IDs against all live
  members but does not establish key fingerprints. It must not be treated as
  proof of key identity for password sharing.
- The worktree already contains uncommitted group-E2EE changes. Those changes
  are outside this feature's scope and must remain intact.

## Trust and key verification

The server-provided public key is an untrusted key claim. On first sharing with
a person, the sender sees that person's SHA-256 fingerprint over the canonical
DER SubjectPublicKeyInfo bytes. The sender compares the displayed fingerprint
with the fingerprint the recipient reads from their own StegoChat device and
communicates through an independent trusted channel (for example, in person or
a separately authenticated call). The sender explicitly marks the match as
verified. The fingerprint is pinned in the sender's local IndexedDB trust
store, keyed by recipient account ID.

The sender's own fingerprint is also displayable and copyable in
`Settings > Security` so recipients can verify it. No password sharing is
allowed for a missing key, an unverified key, a malformed key, or a key whose
fingerprint differs from the local pin.
Every share operation fetches the current conversation keys again and compares
their fingerprints with the pins immediately before encryption. A mismatch
stops the operation. Replacing a local pin requires an explicit replacement
verification after out-of-band comparison; the UI must not silently accept a
changed key.

The current server registration is first-write-only and has no safe rotation
protocol. This feature will not silently overwrite or trust a replacement. A
changed key blocks new shares until the user explicitly verifies and pins the
replacement after out-of-band comparison. The server's current first-write-only
registration has no self-service rotation or recovery endpoint; implementing a
server-side rotation protocol is outside this feature. A lost private key
cannot be recovered. Historical shares remain encrypted to the key fingerprint
selected at creation; losing that private key makes those shares unrecoverable.
No automatic re-enveloping is performed. Rotation does not rekey existing
group-image messages.

Fingerprint pinning only protects against server substitution when users
actually compare fingerprints out of band. There is no key transparency, and
a malicious server can deny service. Compromised devices or malicious
same-origin code can read passwords while they are being revealed.

## Encryption and envelope format

All shares use one hybrid format for direct and group conversations:

1. The sender's browser creates a fresh random 32-byte AES content key and
   12-byte nonce for every share.
2. It encrypts the UTF-8 password with AES-256-GCM. The stored payload contains
   a version, nonce, and GCM ciphertext/tag; it contains no plaintext metadata.
3. The browser imports each selected recipient's pinned RSA-OAEP/SHA-256 public
   key and wraps the content key independently for that recipient.
4. The browser generates a random UUID share context ID and binds a canonical
   JSON array containing the format tag/version, context ID, conversation ID,
   authenticated sender ID, UTC expiry, and one-time flag as AES-GCM additional
   authenticated data. The open response returns those fields for local
   authentication. It submits the context ID, encrypted payload, and
   `{user_id, key_fingerprint, wrapped_key}` entries. It never submits the
   password, AES key, or private key.

Passwords are limited to 4096 UTF-8 bytes. The API accepts only the versioned
binary payload/envelope format within a 6 KiB encrypted-payload bound; it does
not parse or decrypt password text. Expiry is UTC, must be in the future, and
must be no more than 30 days after creation.

The backend cannot verify that a client-generated envelope decrypts, but it
validates structure/size, uniqueness, that each submitted fingerprint matches
the current registered public key, and that the recipient set is a subset of
the authenticated sender's current conversation membership. Invalid
cryptographic data fails locally during recipient decryption. No endpoint
returns another recipient's envelope.

## Conversation and recipient rules

- The entry point is a **Share Password** action in the active conversation.
- In a direct conversation, the peer is the only selectable recipient.
- In a group, recipients are unchecked by default. The sender explicitly
  selects each intended person; selecting all is a separate, explicit action.
- Before encryption, the UI displays the exact recipients, their verified
  fingerprint status, the expiry, and whether one-time open is enabled. The
  sender confirms this exact set.
- The API derives `sender_id` from authentication. A request must identify a
  conversation where the sender is currently a member. Every selected user
  must be a different, active member of that same conversation. Membership
  grants eligibility only; it does not grant access unless a recipient row
  exists for that user.
- A new group member cannot access prior shares. A member who leaves cannot
  fetch shares afterward. Already retrieved ciphertext, a previously copied
  password, or screenshots cannot be recalled.

## Data model and API behavior

Add an additive migration and corresponding additive development initialization.
Use two tables:

- `password_shares`: ID, unique context UUID, conversation ID, authenticated
  sender ID, encrypted payload, creation time, expiry, optional revocation
  time, one-time flag.
- `password_share_recipients`: share ID, recipient user ID, recipient public
  key fingerprint, wrapped content key, per-recipient deletion timestamp, and
  one-time consumption timestamp.
  Enforce unique `(share_id, user_id)`, foreign-key cascades, and indexes for
  sender, recipient, conversation, expiry, and active-share lookups.

All endpoints require authentication:

- `POST /api/password-shares`: create after validating the current conversation
  roster, selected recipients, current public-key fingerprints, context UUID,
  ciphertext and envelope bounds, and expiry. The request schema sets a maximum
  encrypted payload size.
- `GET /api/password-shares?direction=incoming|sent&conversation_id=...`:
  return metadata only. Incoming rows are scoped to the current user's
  recipient rows; outgoing rows to the authenticated sender. Never include
  payloads or wrapped keys in list responses. Incoming results may show
  available, expired, revoked, or consumed status, but omit recipient-deleted
  rows.
- `POST /api/password-shares/{id}/open`: return the encrypted payload and only
  the current user's wrapped key after rechecking recipient ownership,
  conversation membership, deletion, expiry, revocation, and one-time status.
  Include the context UUID, conversation ID, sender ID, canonical expiry, and
  one-time flag required to authenticate the AES-GCM payload.
- `POST /api/password-shares/{id}/revoke`: sender-only; sets revocation time.
  It prevents subsequent server retrieval but cannot invalidate data already
  delivered to a recipient.
- `DELETE /api/password-shares/{id}`: recipient-only; marks that recipient's
  inbox entry deleted without deleting other recipients' shares.

All lookups use authorization-scoped queries and return 404 for missing or
unauthorized share IDs. The server never accepts sender IDs in the request.
Expired shares are rejected on list/open and are not returned as available.
Metadata and encrypted records may remain after expiry, but no endpoint returns
the ciphertext or envelope after expiry. A future retention job may purge old
encrypted records without changing authorization. No request body, password,
ciphertext contents, AES key, or wrapped key is written to application activity
logs.

## One-time open, expiry, revocation, and deletion

For a one-time share, each recipient gets one open. The open endpoint atomically
changes that recipient's `consumed_at` from null before returning ciphertext.
Concurrent/repeated opens by that recipient after the transition are rejected.
This deliberately consumes the share at server delivery, before client decryption:
if the response is lost or local
decryption fails, the recipient cannot retry and must ask the sender to create
a new share. This is best-effort one-time access, not copy prevention. A
recipient can preserve a password after revealing it, including by copying,
screenshot, photography, or another device.

Expiry and revocation deny future opens. They do not erase ciphertext already
downloaded or plaintext already revealed/copied. Recipient deletion removes
that recipient's server-side inbox access, not the sender's record or other
recipients' records. The sender's revoke action applies to the whole share and
all recipients.

## Inbox and frontend behavior

There is no existing push notification service. The chat page will poll the
authenticated incoming-share metadata endpoint while open, show a pending
count/inbox entry, and display a notification containing only the sender and
that a password was shared. The notification contains no password or encrypted
payload.

The recipient opens a share view and explicitly selects **Reveal**. The client
fetches the scoped encrypted response, unwraps the key with its local private
key, validates/decrypts AES-GCM, then displays plaintext only in component
memory. **Copy** is available only after reveal; **Delete** removes that
recipient's server-side inbox view. Closing the view clears password and
visibility state. The sender's sent-share view exposes recipient/status
metadata and **Revoke**, never plaintext.

Expiry choices are 10 minutes, 1 hour, 24 hours, or a custom future timestamp.
Custom expiry is capped at 30 days.
The UI explains that an extraction password does not itself provide the image.
If a recipient key is missing, the sender is told that the recipient must
initialize an E2EE identity from Chat or `Settings > Security`, then verify the
fingerprint; the send action remains blocked.

## Testing and acceptance

Backend tests must cover authenticated creation, server-derived sender ID,
direct and group membership enforcement, selected-recipient-only access,
cross-conversation/modified-ID denial, missing/duplicate/extra recipient
envelopes, missing keys, malformed/oversized encrypted payloads, list response
privacy, sender-only revocation, recipient-only deletion, expiry, concurrent
one-time opens, and no plaintext in persisted records or responses.

Frontend tests must cover AES-GCM round-trip and tamper failure, RSA-OAEP
recipient-only unwrap, fresh key/nonce per share, fingerprint normalization
and pin/mismatch handling, group selection defaulting to none, confirmation
recipient exactness, direct-recipient constraint, blocked sends for missing or
unverified keys, and one-time/reveal/copy state behavior. Regression tests must
retain existing direct/group chat, legacy image extraction, and decoy behavior.
Run backend tests, frontend test suite, typecheck, lint, and build where the
installed environment permits. Report unavailable commands and untested
browser/integration behavior explicitly.

## Security limitations

AES-GCM and RSA-OAEP do not by themselves establish recipient identity. The
independent fingerprint comparison is required and remains user-mediated. No
claim is made that this protects against a malicious server without successful
out-of-band key verification or key transparency. A compromised browser,
extension, OS, or recipient device can expose the password. Recipients can
copy, photograph, or otherwise preserve plaintext. Revocation only blocks
future server retrieval and cannot erase a password already delivered or
revealed. IndexedDB loss, device change, or key rotation without the old private
key makes earlier shares inaccessible; the current design does not provide
multi-device synchronization or account-based private-key recovery.
