import { PageTitle, Prose } from "@/components/layout/MarketingLayout";

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Privacy policy" subtitle="Last updated: July 2026" />
      <Prose>
        <h2>What we collect</h2>
        <p>
          Your account (username, email, hashed password), your settings, and your activity within
          the service: conversations, history entries and uploaded images. Message payloads are
          stored <strong>encrypted</strong>; we hold ciphertext, never plaintext or the passwords
          that unlock it.
        </p>
        <h2>What we never collect</h2>
        <p>
          Steganography passwords, decrypted message contents, decoy contents, or the mapping
          between a stego image and its hidden payload. Key derivation happens per-request and
          keys are discarded immediately after use.
        </p>
        <h2>How data is used</h2>
        <p>
          Solely to operate the service: authenticating you, delivering messages, rendering your
          history and dashboard. We do not sell data, run ads, or share anything with third
          parties except when legally compelled — in which case we can only hand over ciphertext.
        </p>
        <h2>Retention & deletion</h2>
        <p>
          Share links stop working on expiry, once their open limit is hit, or when you revoke
          them. You can delete individual history
          entries, clear everything, or delete your account from <code>Settings</code> — account
          deletion permanently removes your data and files. You can export everything as JSON at
          any time.
        </p>
        <h2>Security</h2>
        <p>
          AES-256 encryption with PBKDF2 key derivation, bcrypt password hashing, short-lived JWTs
          with rotating refresh tokens, rate limiting and strict security headers. No system is
          perfect; report vulnerabilities via the Contact page.
        </p>
      </Prose>
    </div>
  );
}
