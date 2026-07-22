import { useState } from "react";
import { PageTitle, Prose } from "@/components/layout/MarketingLayout";
import { cn } from "@/lib/utils";

const sections = [
  {
    id: "getting-started",
    title: "Getting started",
    body: (
      <Prose>
        <p>
          Create a vault with a username, email and a strong password. Your vault holds your
          conversations, history and stego files. Verify your email from{" "}
          <code>Settings → Profile</code> to raise your security score.
        </p>
        <h3>The two messaging modes</h3>
        <p>
          <strong>Normal chat</strong> works like any messenger — find a user, type, send.{" "}
          <strong>Steganography mode</strong> starts from the image button in the composer: pick a
          cover image, write your secret and set a password. The recipient taps{" "}
          <em>Reveal hidden message</em> and enters the password.
        </p>
      </Prose>
    ),
  },
  {
    id: "studio",
    title: "Stego Studio",
    body: (
      <Prose>
        <p>
          The Studio is the standalone workbench for hiding and revealing messages outside of any
          conversation. Upload an image (or pick a sample / random one), write your message, set a
          password and download the resulting PNG.
        </p>
        <h3>Capacity</h3>
        <p>
          An image can carry roughly <code>width × height × 3 ÷ 8</code> bytes. The Studio shows a
          live capacity meter as you type; if your message doesn't fit, use a larger image.
        </p>
        <h3>Decoys</h3>
        <p>
          A decoy is a second, harmless message embedded under a different password. If you're
          ever forced to reveal a password, hand over the decoy's — the real message stays hidden.
        </p>
        <h3>Share links</h3>
        <p>
          After hiding a message, use <em>Create share link</em> to mint a short token link that
          serves the stego image. Optionally protect it with an access password, set an expiry
          (1 hour to 30 days), or cap the number of opens (including burn-after-read). Recipients
          need no account — just the link — and reveal the hidden message with its password.
          Manage or revoke every link from the <em>Share links</em> page.
        </p>
      </Prose>
    ),
  },
  {
    id: "security",
    title: "Security model",
    body: (
      <Prose>
        <p>
          Messages are encrypted with <strong>AES-256</strong> using keys derived from your
          password via <strong>PBKDF2</strong> (200k iterations) with a random <strong>salt</strong>{" "}
          and <strong>IV</strong> per message. The ciphertext — never the plaintext — is embedded
          into the image's least-significant bits in a password-seeded order.
        </p>
        <p>
          Passwords are never stored. History keeps ciphertext and truncated previews only.
          Authentication uses short-lived JWT access tokens with rotating refresh tokens, and the
          API is rate-limited.
        </p>
        <h3>What StegoChat does not protect against</h3>
        <p>
          Re-compression (WhatsApp, Instagram, most social media) destroys LSB data — share stego
          images as files, not photos. A weak password is still a weak password. And if your
          device is compromised, nothing at the protocol level saves you.
        </p>
      </Prose>
    ),
  },
  {
    id: "forensics",
    title: "Forensics lab",
    body: (
      <Prose>
        <p>
          The Forensics lab helps you inspect images <em>before</em> trusting them. The{" "}
          <strong>Analyzer</strong> runs a server-side statistical scan (entropy, LSB anomaly
          score). The <strong>histogram</strong>, <strong>bit-plane</strong> and{" "}
          <strong>LSB viewers</strong> run entirely in your browser. <strong>Compare</strong>{" "}
          diffs two images with 16× amplification, and <strong>Metadata</strong> computes a
          SHA-256 integrity hash you can verify out-of-band.
        </p>
      </Prose>
    ),
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    body: (
      <Prose>
        <p>
          Press <code>?</code> anywhere in the app for the full list. The essentials:{" "}
          <code>g</code> then <code>c</code> jumps to Chats, <code>g</code> then <code>s</code> to
          the Studio, and <code>[</code> collapses the sidebar.
        </p>
      </Prose>
    ),
  },
  {
    id: "api",
    title: "API",
    body: (
      <Prose>
        <p>
          The backend is a FastAPI service with interactive documentation at{" "}
          <code>/api/docs</code>. All endpoints under <code>/api</code> require a Bearer token
          except registration, login and share-link redeems. See the repository's{" "}
          <code>docs/API.md</code> for the full reference.
        </p>
      </Prose>
    ),
  },
];

export default function Docs() {
  const [active, setActive] = useState(sections[0].id);
  const current = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <div>
      <PageTitle title="Documentation" subtitle="Everything you need to hide in plain sight." />
      <div className="grid gap-8 md:grid-cols-[200px,1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                active === s.id
                  ? "bg-accent/15 text-content ring-1 ring-accent/30"
                  : "text-muted hover:bg-white/5 hover:text-content",
              )}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div className="card min-w-0 p-6 sm:p-8">
          <h2 className="mb-4 font-display text-2xl font-semibold">{current.title}</h2>
          {current.body}
        </div>
      </div>
    </div>
  );
}
