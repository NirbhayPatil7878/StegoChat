import { Bug, Mail, MessageSquareHeart, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/layout/MarketingLayout";
import { Button, Card } from "@/components/ui";

const channels = [
  {
    icon: ShieldAlert,
    title: "Security reports",
    desc: "Found a vulnerability? Tell us privately before disclosing.",
    detail: "security@stegochat.example",
  },
  {
    icon: Bug,
    title: "Bug reports",
    desc: "Something broken? Open an issue in the repository.",
    detail: "github.com/stegochat/issues",
  },
  {
    icon: MessageSquareHeart,
    title: "Everything else",
    desc: "Feedback, questions, ideas — we read all of it.",
    detail: "hello@stegochat.example",
  },
];

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div>
      <PageTitle title="Contact" subtitle="Say hello — no steganography required." />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          {channels.map((c) => (
            <Card key={c.title} className="flex items-start gap-4 p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10">
                <c.icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-display font-semibold">{c.title}</h3>
                <p className="mt-1 text-sm text-muted">{c.desc}</p>
                <p className="mt-1.5 font-mono text-xs text-accent">{c.detail}</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          {sent ? (
            <div className="grid h-full min-h-[260px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-success/15">
                  <Mail className="h-7 w-7 text-success" />
                </div>
                <h3 className="font-display text-lg font-semibold">Message sent</h3>
                <p className="mt-1 text-sm text-muted">We'll get back to you soon.</p>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
                toast.success("Thanks — we'll be in touch.");
              }}
            >
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Message</label>
                <textarea
                  className="input min-h-[120px] resize-y"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                <Send className="h-4 w-4" /> Send message
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
