import { Eye, Fingerprint, Layers, Lock } from "lucide-react";
import { PageTitle, Prose } from "@/components/layout/MarketingLayout";
import { Card } from "@/components/ui";

const values = [
  {
    icon: Lock,
    title: "Encryption first",
    desc: "Every payload is AES-256 encrypted with PBKDF2-derived keys, a random salt and IV — before a single pixel is touched.",
  },
  {
    icon: Layers,
    title: "Invisibility second",
    desc: "Ciphertext is woven into the least-significant bits of ordinary images, statistically close to untouched photos.",
  },
  {
    icon: Eye,
    title: "Deniability third",
    desc: "Decoy messages and revocable, expiring share links give you control over what's revealed and for how long.",
  },
  {
    icon: Fingerprint,
    title: "Zero plaintext at rest",
    desc: "Passwords never leave your session and history stores ciphertext only. We can't read your secrets — by design.",
  },
];

export default function About() {
  return (
    <div>
      <PageTitle
        title="About StegoChat"
        subtitle="A secure communication platform where every image can carry a secret."
      />
      <Prose>
        <p>
          StegoChat started with a simple observation: encrypted traffic is easy to flag, but a
          holiday photo is not. Modern messengers protect <strong>what</strong> you say; they do
          little to hide <strong>that</strong> you said anything at all. StegoChat closes that gap
          by combining a familiar chat experience with steganography — the craft of hiding
          messages inside innocuous carriers.
        </p>
        <p>
          You can chat normally, like on any modern messenger. And when a conversation needs to
          disappear into the background, you attach an image: your message is encrypted with
          AES-256 and dissolved into the picture's pixels. The recipient needs both the image and
          the password to bring it back.
        </p>
      </Prose>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {values.map((v) => (
          <Card key={v.title} className="p-6">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-accent/10">
              <v.icon className="h-5 w-5 text-accent" />
            </div>
            <h3 className="font-display font-semibold">{v.title}</h3>
            <p className="mt-2 text-sm text-muted">{v.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
