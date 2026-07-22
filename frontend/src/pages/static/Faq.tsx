import { ArrowRight } from "lucide-react";
import { PageTitle } from "@/components/layout/MarketingLayout";

const faqs = [
  {
    q: "Can someone tell a message is hidden in my image?",
    a: "Not by looking. The payload is encrypted and spread pseudo-randomly across the least-significant bits, so the image stays statistically close to an untouched one. Our Forensics lab shows you exactly what an analyst would see.",
  },
  {
    q: "What if I'm forced to reveal my password?",
    a: "Embed a decoy: a second, harmless message under a different password. Hand over the decoy password — the real message stays hidden and there's no way to prove it exists.",
  },
  {
    q: "Do you store my passwords or plaintext?",
    a: "No. Passwords derive encryption keys in-memory and are never persisted. History keeps ciphertext and truncated previews only.",
  },
  {
    q: "Which images work best?",
    a: "Lossless formats — PNG or BMP. Bigger is better: capacity is roughly width × height × 3 ÷ 8 bytes. Output is always PNG because JPEG re-compression destroys hidden data.",
  },
  {
    q: "Can I send stego images over WhatsApp or Instagram?",
    a: "Only as file attachments (document mode). Sending them as photos triggers re-compression, which wipes the hidden payload. StegoChat's built-in chat never re-compresses.",
  },
  {
    q: "What's a share link?",
    a: "A short token link to a stego image you created. Anyone with the link can fetch the image — no account needed — and reveal the hidden message with its password. Links can expire on a timer, cap the number of opens, or be revoked at any time.",
  },
  {
    q: "Can I hide files, not just text?",
    a: "Yes — the API supports embedding arbitrary files using EOF-style embedding, and extraction automatically detects and recovers them.",
  },
  {
    q: "Is StegoChat open source?",
    a: "Yes. The backend (FastAPI + SQLAlchemy) and frontend (React + TypeScript) are in the repository, along with Docker deployment files.",
  },
];

export default function Faq() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Frequently asked questions" subtitle="Short answers to common doubts." />
      <div className="space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="card group p-5 [&_summary]:cursor-pointer">
            <summary className="flex list-none items-center justify-between gap-3 font-medium">
              {f.q}
              <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
            </summary>
            <p className="mt-3 text-sm text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
