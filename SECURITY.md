# Security Policy

StegoChat is a security tool: it encrypts messages and hides them inside images.
Because people may rely on it in situations where confidentiality matters, we try
to be precise about what it does and does not protect against. Overclaiming is
itself a security bug — please report it as one.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via [GitHub Security Advisories](../../security/advisories/new)
or email the maintainers. Include:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept if possible).
- Affected version / commit.

We aim to acknowledge within 72 hours and to ship a fix or mitigation for
confirmed high-severity issues within 30 days. We support coordinated
disclosure and will credit reporters who wish to be named.

## Supported versions

Security fixes target the latest `main` and the most recent tagged release.

## Threat model

### What StegoChat aims to protect against

- **Passive network observers.** Traffic is expected to run over TLS in
  production; the payload inside an image is AES-256-GCM encrypted, so a
  network or storage observer sees only ciphertext scattered in pixel LSBs.
- **Database compromise.** The server persists ciphertext and metadata, never
  plaintext or passwords. Refresh tokens are stored as SHA-256 hashes and
  rotated on use; account passwords are bcrypt-hashed.
- **Casual inspection of a stego image.** LSB embedding in a password-seeded
  pseudo-random order means the image looks ordinary to a human and to naive
  byte inspection.
- **Coercion, to a limited degree.** The decoy-message feature lets a user
  reveal a harmless second message under a different password.

### What StegoChat does NOT protect against (known limitations)

- **Determined steganalysis.** Plain LSB embedding is detectable by established
  statistical attacks (RS analysis, chi-square, sample-pair, tools such as
  StegExpose). StegoChat raises the bar against casual detection, **not**
  against a resourceful analyst who suspects steganography. Do not rely on it
  to hide *the existence* of a message from a capable adversary.
- **A compromised endpoint.** In the current architecture the server processes
  plaintext and passwords in memory per request. A compromised server, or
  malware on the client device, defeats the scheme. (Client-side / zero-knowledge
  encryption is tracked as a roadmap item.)
- **Global adversaries / traffic-correlation.** Timing, size, and metadata
  analysis across many messages are out of scope.
- **Lossy transforms.** Re-encoding a stego PNG to JPEG, resizing, or running it
  through platforms that recompress images destroys the hidden payload by design.
- **Weak passwords.** Key strength derives entirely from the user's password via
  PBKDF2. A weak password is brute-forceable offline.

### Cryptographic details

- AES-256-GCM (authenticated encryption) with a random salt and nonce per message.
- PBKDF2-HMAC key derivation. *(Roadmap: migrate to Argon2id; this will be a
  versioned envelope change to preserve backward compatibility.)*
- The GCM tag authenticates the payload: a wrong password or any tampering fails
  cleanly rather than returning garbage.

## Operational guidance

- Always set a strong, unique `STEGOCHAT_SECRET_KEY` in production.
- Terminate TLS in front of the app; enable HSTS (already sent in production).
- Keep dependencies patched — CI runs `pip-audit` and Dependabot is enabled.

## Legal note

Cryptographic and steganographic software is subject to export controls in some
jurisdictions (e.g. the US EAR) and is restricted or illegal in others. Operators
and users are responsible for compliance with their local laws.
