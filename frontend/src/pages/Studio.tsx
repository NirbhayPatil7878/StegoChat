import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileDown,
  Files,
  Link2,
  Lock,
  Shuffle,
  Sparkles,
  Unlock,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { stegoApi, tokenApi } from "@/api/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Dropzone } from "@/components/ui/Dropzone";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { QRCode } from "@/components/ui/QRCode";
import { Toggle } from "@/components/ui/Toggle";
import { Button, Card, Chip, Spinner } from "@/components/ui";
import { randomDecoyMessage, randomDecoyPassword } from "@/lib/decoy";
import { cn, copyToClipboard, formatBytes } from "@/lib/utils";
import type {
  EmbedResponse,
  ExtractResponse,
  SampleImage,
  ShareTokenCreateResponse,
  SplitEmbedResponse,
} from "@/types";

/** Rough LSB capacity: 3 bits/pixel packed into bytes, minus header overhead. */
function estimateCapacity(width: number, height: number): number {
  return Math.max(0, Math.floor((width * height * 3) / 8) - 256);
}

function useImageDims(src: string | null) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setDims(null);
    if (!src) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);
  return dims;
}

// --- Cover image picker (upload / samples / random) --------------------------
function CoverPicker({
  file,
  sample,
  samples,
  onFile,
  onSample,
}: {
  file: File | null;
  sample: string | null;
  samples: SampleImage[] | undefined;
  onFile: (f: File | null) => void;
  onSample: (name: string | null) => void;
}) {
  const sampleUrl = samples?.find((s) => s.name === sample)?.url ?? null;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="label mb-0">Cover image</label>
        {samples?.length ? (
          <button
            onClick={() => {
              onFile(null);
              onSample(samples[Math.floor(Math.random() * samples.length)].name);
            }}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Shuffle className="h-3 w-3" /> Random image
          </button>
        ) : null}
      </div>

      {sample && !file && sampleUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-border">
          <img
            src={sampleUrl}
            alt="Selected sample"
            className="max-h-[min(12rem,28vh)] w-full object-cover"
          />
          <button
            onClick={() => onSample(null)}
            className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
            aria-label="Remove sample"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <Dropzone file={file} onFile={(f) => { onFile(f); if (f) onSample(null); }} />
      )}

      {!file && samples?.length ? (
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
          {samples.slice(0, 16).map((s) => (
            <button
              key={s.name}
              onClick={() => onSample(sample === s.name ? null : s.name)}
              className={cn(
                "overflow-hidden rounded-lg border-2 transition-colors",
                sample === s.name ? "border-accent" : "border-transparent hover:border-border",
              )}
            >
              <img src={s.url} alt={s.name} className="aspect-square w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// --- Fake-but-honest progress: animates while the mutation is pending ---------
function ProgressBar({ active, done }: { active: boolean; done: boolean }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(done ? 100 : 0);
      return;
    }
    setValue(8);
    const t = setInterval(
      () => setValue((v) => Math.min(v + Math.random() * 14, 92)),
      280,
    );
    return () => clearInterval(t);
  }, [active, done]);

  if (!active && !done) return null;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-border">
      <motion.div
        animate={{ width: `${value}%` }}
        transition={{ ease: "easeOut", duration: 0.3 }}
        className="h-full rounded-full bg-gradient-to-r from-accent to-cyan"
      />
    </div>
  );
}

// --- Embed panel ---------------------------------------------------------------
// --- Share link creator (post-embed) -----------------------------------------
const TTL_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "Never", hours: null },
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "1 week", hours: 168 },
  { label: "30 days", hours: 720 },
];

function ShareLinkCreator({ stegoFilename }: { stegoFilename: string }) {
  const [open, setOpen] = useState(false);
  const [accessOn, setAccessOn] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [ttlHours, setTtlHours] = useState<number | null>(24);
  const [maxReads, setMaxReads] = useState<number | null>(null);
  const [created, setCreated] = useState<ShareTokenCreateResponse | null>(null);

  const create = useMutation({
    mutationFn: () =>
      tokenApi.create({
        stego_filename: stegoFilename,
        access_password: accessOn ? accessPassword : null,
        ttl_hours: ttlHours,
        max_reads: maxReads,
      }),
    onSuccess: (r) => {
      setCreated(r);
      toast.success("Share link created");
    },
    onError: (e) => toast.error(apiError(e, "Could not create link")),
  });

  const fullLink = created ? `${window.location.origin}${created.share_path}` : "";

  if (created) {
    return (
      <div className="space-y-2 rounded-2xl bg-accent/10 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <Link2 className="h-4 w-4" /> Share link ready
        </div>
        <button
          onClick={async () =>
            (await copyToClipboard(fullLink))
              ? toast.success("Link copied")
              : toast.error("Could not copy")
          }
          className="flex w-full items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2.5 text-left hover:bg-surface-2"
        >
          <span className="truncate font-mono text-xs">{fullLink}</span>
          <Copy className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />
        </button>
        <div className="flex flex-col items-center pt-1">
          <QRCode value={fullLink} size={148} downloadName="stegochat-share-qr.png" />
          <p className="mt-1 text-[11px] text-muted">Scan to open on a phone</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {created.protected && <Chip tone="accent">Password protected</Chip>}
          <Link to="/app/tokens" className="text-accent hover:underline">
            Manage links →
          </Link>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4" /> Create share link
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-medium">Share by token</p>
      <p className="text-xs text-muted">
        Generates a short link anyone can open to fetch this image. The hidden
        message still needs its own password to reveal.
      </p>

      <div>
        <label className="label">Expires after</label>
        <select
          className="input"
          value={ttlHours ?? ""}
          onChange={(e) => setTtlHours(e.target.value === "" ? null : Number(e.target.value))}
        >
          {TTL_OPTIONS.map((o) => (
            <option key={o.label} value={o.hours ?? ""}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Max opens</label>
        <select
          className="input"
          value={maxReads ?? ""}
          onChange={(e) => setMaxReads(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">Unlimited</option>
          <option value={1}>1 (burn after read)</option>
          <option value={5}>5</option>
          <option value={25}>25</option>
        </select>
      </div>

      <Toggle
        checked={accessOn}
        onChange={setAccessOn}
        label="Password-protect the link"
        description="Recipients must enter this before the image loads."
      />
      <AnimatePresence>
        {accessOn && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <PasswordInput
              placeholder="Access password"
              value={accessPassword}
              onChange={(e) => setAccessPassword(e.target.value)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          loading={create.isPending}
          disabled={accessOn && !accessPassword}
          onClick={() => create.mutate()}
        >
          <Check className="h-4 w-4" /> Create link
        </Button>
      </div>
    </div>
  );
}

function EmbedPanel() {
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sample, setSample] = useState<string | null>(null);
  const [decoyOn, setDecoyOn] = useState(false);
  const [decoyMessage, setDecoyMessage] = useState("");
  const [decoyPassword, setDecoyPassword] = useState("");

  const { data: samples } = useQuery({ queryKey: ["samples"], queryFn: stegoApi.samples });

  const coverUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return samples?.find((s) => s.name === sample)?.url ?? null;
  }, [file, sample, samples]);
  const dims = useImageDims(coverUrl);

  const capacity = dims ? estimateCapacity(dims.w, dims.h) : null;
  const messageBytes = new TextEncoder().encode(message).length;
  const overCapacity = capacity !== null && messageBytes > capacity;

  const embed = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("message", message);
      form.append("password", password);
      if (file) form.append("image", file);
      else if (sample) form.append("sample", sample);
      if (decoyOn && decoyMessage && decoyPassword) {
        form.append("decoy_message", decoyMessage);
        form.append("decoy_password", decoyPassword);
      }
      return stegoApi.embed(form);
    },
    onSuccess: () => toast.success("Message hidden successfully"),
    onError: (e) => toast.error(apiError(e, "Embed failed")),
  });

  // One-click plausible decoy: harmless message, a distinct password, and a
  // random cover image if none is chosen yet.
  const autoGenerateDecoy = () => {
    setDecoyOn(true);
    setDecoyMessage(randomDecoyMessage());
    let pw = randomDecoyPassword();
    while (pw === password) pw = randomDecoyPassword();
    setDecoyPassword(pw);
    if (!file && !sample && samples?.length) {
      setSample(samples[Math.floor(Math.random() * samples.length)].name);
    }
  };

  const result = embed.data as EmbedResponse | undefined;
  const canEmbed =
    message.trim() &&
    password &&
    (file || sample) &&
    !overCapacity &&
    (!decoyOn || (decoyMessage.trim() && decoyPassword));

  return (
    <div className="grid gap-fluid lg:grid-cols-2">
      <Card className="space-y-4">
        <div>
          <label className="label">Secret message</label>
          <textarea
            className="input min-h-[96px] resize-y"
            placeholder="What do you want to hide?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {capacity !== null && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={overCapacity ? "text-danger" : "text-muted"}>
                  {formatBytes(messageBytes)} of ~{formatBytes(capacity)} capacity
                </span>
                {overCapacity && <Chip tone="danger">Too large for this image</Chip>}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                <div
                  className={cn(
                    "h-full rounded-full",
                    overCapacity ? "bg-danger" : "bg-gradient-to-r from-accent to-cyan",
                  )}
                  style={{ width: `${Math.min((messageBytes / Math.max(capacity, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label">Password</label>
          <PasswordInput
            placeholder="Used to derive the AES-256 key"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrength
          />
        </div>

        <div className="flex items-start justify-between gap-2">
          <Toggle
            checked={decoyOn}
            onChange={setDecoyOn}
            label="Decoy message"
            description="A second, harmless message under a different password."
          />
          <button
            type="button"
            onClick={autoGenerateDecoy}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-accent hover:underline"
          >
            <Wand2 className="h-3 w-3" /> Auto-generate
          </button>
        </div>
        <AnimatePresence>
          {decoyOn && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <textarea
                className="input min-h-[60px] resize-y"
                placeholder="Decoy message (revealed under duress)…"
                value={decoyMessage}
                onChange={(e) => setDecoyMessage(e.target.value)}
              />
              <PasswordInput
                placeholder="Decoy password"
                value={decoyPassword}
                onChange={(e) => setDecoyPassword(e.target.value)}
              />
            </motion.div>
          )}
        </AnimatePresence>

      </Card>

      <div className="space-y-fluid">
        <Card>
          <CoverPicker
            file={file}
            sample={sample}
            samples={samples}
            onFile={setFile}
            onSample={setSample}
          />
        </Card>

        <Card className="space-y-3">
          <ProgressBar active={embed.isPending} done={!!result} />
          <Button
            className="w-full py-3"
            disabled={!canEmbed}
            loading={embed.isPending}
            onClick={() => embed.mutate()}
          >
            <Lock className="h-4 w-4" /> Encrypt & hide
          </Button>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="overflow-hidden rounded-2xl border border-border">
                  <img
                    src={result.stego_url}
                    alt="Stego output"
                    className="max-h-[min(14rem,30vh)] w-full bg-surface-2/50 object-contain"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href={result.stego_url} download={result.stego_filename}>
                    <Button variant="outline">
                      <Download className="h-4 w-4" /> Download stego image
                    </Button>
                  </a>
                  {result.decoy_enabled && <Chip tone="warning">Decoy embedded</Chip>}
                </div>
                <ShareLinkCreator stegoFilename={result.stego_filename} />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}

// --- Extract panel ---------------------------------------------------------------
function ExtractPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");

  const extract = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("password", password);
      if (file) form.append("image", file);
      return stegoApi.extract(form);
    },
    onError: (e) => toast.error(apiError(e, "Nothing found — wrong password or clean image")),
  });

  const result = extract.data as ExtractResponse | undefined;

  return (
    <div className="grid gap-fluid lg:grid-cols-2">
      <Card className="space-y-4">
        <div>
          <label className="label">Stego image</label>
          <Dropzone
            file={file}
            onFile={(f) => {
              setFile(f);
              extract.reset();
            }}
            hint="The PNG you received — drop it here"
          />
        </div>
        <div>
          <label className="label">Password</label>
          <PasswordInput
            placeholder="The password it was hidden with"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ProgressBar active={extract.isPending} done={!!result} />
        <Button
          className="w-full py-3"
          disabled={!file || !password}
          loading={extract.isPending}
          onClick={() => extract.mutate()}
        >
          <Unlock className="h-4 w-4" /> Reveal message
        </Button>
      </Card>

      <Card>
        {extract.isPending ? (
          <div className="grid min-h-[240px] place-items-center">
            <Spinner className="h-7 w-7" />
          </div>
        ) : result ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-success/15">
                <Unlock className="h-4 w-4 text-success" />
              </div>
              <h3 className="font-display font-semibold">
                {result.kind === "file" ? "Hidden file recovered" : "Hidden message revealed"}
              </h3>
            </div>
            {result.kind === "file" ? (
              <a href={result.payload_url ?? "#"} download={result.filename ?? "payload"}>
                <Button variant="outline">
                  <FileDown className="h-4 w-4" />
                  {result.filename ?? "Download payload"}
                </Button>
              </a>
            ) : (
              <p className="whitespace-pre-wrap break-words rounded-xl bg-success/10 p-4 text-sm">
                {result.message}
              </p>
            )}
          </motion.div>
        ) : (
          <div className="grid min-h-[240px] place-items-center text-center">
            <div>
              <Eye className="mx-auto mb-3 h-8 w-8 text-muted/50" />
              <p className="text-sm text-muted">No hidden messages yet.</p>
              <p className="mt-1 text-xs text-muted/70">
                Drop a stego image and enter its password to see what's inside.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// --- Hide-any-file panel (universal append) ----------------------------------
function HideFilePanel() {
  const [dir, setDir] = useState<"hide" | "reveal">("hide");
  const [carrier, setCarrier] = useState<File | null>(null);
  const [payload, setPayload] = useState<File | null>(null);
  const [password, setPassword] = useState("");

  const hide = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("carrier", carrier!);
      form.append("payload", payload!);
      form.append("password", password);
      return stegoApi.hideFile(form);
    },
    onSuccess: () => toast.success("File hidden inside the carrier"),
    onError: (e) => toast.error(apiError(e, "Hide failed")),
  });
  const reveal = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("carrier", carrier!);
      form.append("password", password);
      return stegoApi.revealFile(form);
    },
    onError: (e) => toast.error(apiError(e, "Nothing found — wrong password or no hidden file")),
  });

  const hideResult = hide.data as EmbedResponse | undefined;
  const revealResult = reveal.data as ExtractResponse | undefined;

  const reset = () => {
    setCarrier(null);
    setPayload(null);
    hide.reset();
    reveal.reset();
  };

  return (
    <div className="grid gap-fluid lg:grid-cols-2">
      <Card className="space-y-4">
        <div className="flex w-fit gap-1 rounded-xl bg-surface-2/60 p-1">
          {(
            [
              { key: "hide", label: "Hide a file" },
              { key: "reveal", label: "Reveal a file" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setDir(t.key);
                reset();
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                dir === t.key ? "bg-accent/20 text-content" : "text-muted hover:text-content",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted">
          Append-hiding works with <strong>any</strong> carrier — image, video, audio, PDF, zip.
          The carrier still opens normally; the payload is AES-256 encrypted and recoverable only
          with the password.
        </p>

        <div>
          <label className="label">{dir === "hide" ? "Carrier file" : "File to inspect"}</label>
          <Dropzone
            file={carrier}
            onFile={(f) => {
              setCarrier(f);
              hide.reset();
              reveal.reset();
            }}
            accept="*"
            hint="Any file — image, video, audio, PDF, zip… up to 64 MB"
          />
        </div>

        {dir === "hide" && (
          <div>
            <label className="label">Secret file to hide</label>
            <Dropzone
              file={payload}
              onFile={(f) => {
                setPayload(f);
                hide.reset();
              }}
              accept="*"
              hint="The file to conceal — any type"
            />
          </div>
        )}

        <div>
          <label className="label">Password</label>
          <PasswordInput
            placeholder="Used to derive the AES-256 key"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrength={dir === "hide"}
          />
        </div>

        {dir === "hide" ? (
          <Button
            className="w-full py-3"
            disabled={!carrier || !payload || !password}
            loading={hide.isPending}
            onClick={() => hide.mutate()}
          >
            <Lock className="h-4 w-4" /> Encrypt & hide file
          </Button>
        ) : (
          <Button
            className="w-full py-3"
            disabled={!carrier || !password}
            loading={reveal.isPending}
            onClick={() => reveal.mutate()}
          >
            <Unlock className="h-4 w-4" /> Recover hidden file
          </Button>
        )}
      </Card>

      <Card>
        {dir === "hide" && hideResult ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="mb-1 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-success/15">
                <FileArchive className="h-4 w-4 text-success" />
              </div>
              <h3 className="font-display font-semibold">Carrier ready</h3>
            </div>
            <p className="text-sm text-muted">
              Download the carrier below — it opens exactly like the original file, but your secret
              rides along inside it.
            </p>
            <a href={hideResult.stego_url} download={hideResult.stego_filename}>
              <Button variant="outline">
                <Download className="h-4 w-4" /> Download carrier
              </Button>
            </a>
          </motion.div>
        ) : dir === "reveal" && revealResult ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-success/15">
                <Unlock className="h-4 w-4 text-success" />
              </div>
              <h3 className="font-display font-semibold">Hidden file recovered</h3>
            </div>
            <a href={revealResult.payload_url ?? "#"} download={revealResult.filename ?? "payload"}>
              <Button variant="outline">
                <FileDown className="h-4 w-4" /> {revealResult.filename ?? "Download payload"}
              </Button>
            </a>
          </motion.div>
        ) : (
          <div className="grid min-h-[240px] place-items-center text-center">
            <div>
              <FileArchive className="mx-auto mb-3 h-8 w-8 text-muted/50" />
              <p className="text-sm text-muted">
                {dir === "hide"
                  ? "Pick a carrier and a secret file to conceal it inside."
                  : "Drop a carrier file and enter its password to extract what's inside."}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// --- Multi-image split panel -------------------------------------------------
function SplitPanel() {
  const [dir, setDir] = useState<"split" | "join">("split");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [images, setImages] = useState<File[]>([]);

  const split = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("message", message);
      form.append("password", password);
      images.forEach((img) => form.append("images", img));
      return stegoApi.embedSplit(form);
    },
    onSuccess: () => toast.success("Message split across images"),
    onError: (e) => toast.error(apiError(e, "Split failed")),
  });
  const join = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("password", password);
      images.forEach((img) => form.append("images", img));
      return stegoApi.extractSplit(form);
    },
    onError: (e) => toast.error(apiError(e, "Could not reassemble — check you have all the parts")),
  });

  const splitResult = split.data as SplitEmbedResponse | undefined;
  const joinResult = join.data as ExtractResponse | undefined;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setImages((prev) => [...prev, ...Array.from(files)]);
    split.reset();
    join.reset();
  };

  return (
    <div className="grid gap-fluid lg:grid-cols-2">
      <Card className="space-y-4">
        <div className="flex w-fit gap-1 rounded-xl bg-surface-2/60 p-1">
          {(
            [
              { key: "split", label: "Split message" },
              { key: "join", label: "Reassemble" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setDir(t.key);
                setImages([]);
                split.reset();
                join.reset();
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                dir === t.key ? "bg-accent/20 text-content" : "text-muted hover:text-content",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted">
          {dir === "split"
            ? "Spread one message across several images — no single image reveals the whole thing, and you sidestep any single image's capacity limit."
            : "Upload every part you received (in any order) to rebuild the original message."}
        </p>

        {dir === "split" && (
          <div>
            <label className="label">Secret message</label>
            <textarea
              className="input min-h-[96px] resize-y"
              placeholder="A long message to divide across images…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label">
            {dir === "split" ? "Cover images (2 or more)" : "All the split images"}
          </label>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center hover:border-accent/50">
            <Files className="h-6 w-6 text-accent" />
            <span className="text-sm">
              Drop or <span className="text-accent">browse</span> multiple PNG/JPG images
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
          {images.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {images.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-1.5 text-sm"
                >
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{formatBytes(f.size)}</span>
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 text-muted hover:text-danger"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <p className="text-xs text-muted">{images.length} image(s) selected</p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Password</label>
          <PasswordInput
            placeholder="Used to derive the AES-256 key"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrength={dir === "split"}
          />
        </div>

        {dir === "split" ? (
          <Button
            className="w-full py-3"
            disabled={!message.trim() || !password || images.length < 2}
            loading={split.isPending}
            onClick={() => split.mutate()}
          >
            <Files className="h-4 w-4" /> Split across {images.length || ""} images
          </Button>
        ) : (
          <Button
            className="w-full py-3"
            disabled={!password || images.length < 2}
            loading={join.isPending}
            onClick={() => join.mutate()}
          >
            <Unlock className="h-4 w-4" /> Reassemble message
          </Button>
        )}
      </Card>

      <Card>
        {dir === "split" && splitResult ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="mb-1 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-success/15">
                <Files className="h-4 w-4 text-success" />
              </div>
              <h3 className="font-display font-semibold">{splitResult.total} parts ready</h3>
            </div>
            <p className="text-sm text-muted">
              Download every part and share them. All parts plus the password are needed to
              reassemble the message.
            </p>
            <div className="space-y-2">
              {splitResult.parts.map((p) => (
                <a
                  key={p.index}
                  href={p.stego_url}
                  download={p.stego_filename}
                  className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:border-accent/50"
                >
                  <Download className="h-4 w-4 text-accent" />
                  Part {p.index + 1} of {splitResult.total}
                  <span className="ml-auto text-xs text-muted">{p.stego_filename}</span>
                </a>
              ))}
            </div>
          </motion.div>
        ) : dir === "join" && joinResult ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-success/15">
                <Unlock className="h-4 w-4 text-success" />
              </div>
              <h3 className="font-display font-semibold">Message reassembled</h3>
            </div>
            <p className="whitespace-pre-wrap break-words rounded-xl bg-success/10 p-4 text-sm">
              {joinResult.message}
            </p>
          </motion.div>
        ) : (
          <div className="grid min-h-[240px] place-items-center text-center">
            <div>
              <Files className="mx-auto mb-3 h-8 w-8 text-muted/50" />
              <p className="text-sm text-muted">
                {dir === "split"
                  ? "Add a message and at least 2 images to split it across them."
                  : "Upload all the parts to rebuild the hidden message."}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// --- Page ---------------------------------------------------------------------------
type StudioMode = "embed" | "extract" | "split" | "hidefile";

export default function Studio() {
  const location = useLocation();
  const [mode, setMode] = useState<StudioMode>(
    location.pathname.endsWith("/extract") ? "extract" : "embed",
  );

  return (
    <div>
      <PageHeader
        title="Stego Studio"
        subtitle="Hide encrypted messages in images, split them across several, or conceal any file inside any other."
      />

      <div className="mb-5 flex w-fit flex-wrap gap-1 rounded-xl bg-surface-2/60 p-1">
        {(
          [
            { key: "embed", label: "Hide message", icon: Sparkles },
            { key: "extract", label: "Extract message", icon: Unlock },
            { key: "split", label: "Split across images", icon: Files },
            { key: "hidefile", label: "Hide any file", icon: FileArchive },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              mode === t.key ? "bg-accent/20 text-content" : "text-muted hover:text-content",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {mode === "embed" && <EmbedPanel />}
      {mode === "extract" && <ExtractPanel />}
      {mode === "split" && <SplitPanel />}
      {mode === "hidefile" && <HideFilePanel />}
    </div>
  );
}
