import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  Binary,
  CheckCircle2,
  Copy,
  FileSearch,
  GitCompareArrows,
  Grid3X3,
  Info,
  ScanEye,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiError } from "@/api/client";
import { stegoApi } from "@/api/services";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Chip } from "@/components/ui";
import { Dropzone } from "@/components/ui/Dropzone";
import {
  Channel,
  LoadedImage,
  histogram,
  loadImageData,
  renderBitPlane,
  renderDiff,
  renderLsbVisualization,
} from "@/lib/imageTools";
import { cn, copyToClipboard, formatBytes, formatDateTime, sha256Hex } from "@/lib/utils";
import type { ForensicResult } from "@/types";

const levelMeta = {
  safe: { icon: CheckCircle2, tone: "success" as const, label: "Looks clean", box: "bg-success/15 text-success" },
  risky: { icon: AlertTriangle, tone: "warning" as const, label: "Some anomalies", box: "bg-warning/15 text-warning" },
  suspicious: { icon: ShieldAlert, tone: "danger" as const, label: "Likely hidden data", box: "bg-danger/15 text-danger" },
};

type Tool = "analyzer" | "histogram" | "bitplane" | "lsb" | "compare" | "info";

const tools: { key: Tool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "analyzer", label: "Analyzer", icon: ScanEye },
  { key: "histogram", label: "Histogram", icon: BarChart3 },
  { key: "bitplane", label: "Bit planes", icon: Grid3X3 },
  { key: "lsb", label: "LSB view", icon: Binary },
  { key: "compare", label: "Compare", icon: GitCompareArrows },
  { key: "info", label: "Metadata", icon: Info },
];

// --- Server-side statistical analyzer ---------------------------------------
function AnalyzerTool({ file }: { file: File }) {
  const analyze = useMutation({
    mutationFn: (f: File) => stegoApi.forensics(f),
    onError: (e) => toast.error(apiError(e, "Analysis failed")),
  });

  useEffect(() => {
    analyze.mutate(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const result = analyze.data as ForensicResult | undefined;
  if (!result) {
    return (
      <div className="grid min-h-[200px] place-items-center text-sm text-muted">
        Running statistical analysis…
      </div>
    );
  }

  const meta = levelMeta[result.level];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex items-center gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${meta.box}`}>
          <meta.icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display font-semibold">{meta.label}</h3>
          <Chip tone={meta.tone}>{result.level}</Chip>
        </div>
      </div>

      <div className="space-y-3">
        <Metric label="Entropy" value={`${result.entropy} / 8.0`} bar={result.entropy / 8} />
        <Metric
          label="LSB anomaly score"
          value={`${result.lsb_anomaly_score}`}
          bar={Math.min(result.lsb_anomaly_score / 100, 1)}
        />
        <Metric label="LSB density" value={`${result.lsb_density}`} bar={Math.min(result.lsb_density, 1)} />
        <Row label="Dimensions">
          {result.image.width && result.image.height
            ? `${result.image.width}×${result.image.height} ${result.image.format ?? ""}`
            : "—"}
        </Row>
        <Row label="Size">{formatBytes(result.size_bytes)}</Row>
        <Row label="Malformed">{result.malformed ? "Yes" : "No"}</Row>
      </div>

      {result.reasons.length > 0 && (
        <div className="mt-5">
          <p className="label">Flags</p>
          <ul className="space-y-1.5">
            {result.reasons.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm text-muted">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

// --- RGB histogram -------------------------------------------------------------
function HistogramTool({ img }: { img: LoadedImage }) {
  const hist = useMemo(() => histogram(img), [img]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 512;
    const H = 200;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    const max = Math.max(...hist.r, ...hist.g, ...hist.b, 1);
    const channels: [number[], string][] = [
      [hist.r, "rgba(248,113,113,0.8)"],
      [hist.g, "rgba(52,211,153,0.8)"],
      [hist.b, "rgba(96,165,250,0.8)"],
    ];
    ctx.globalCompositeOperation = "lighter";
    for (const [data, color] of channels) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < 256; i++) {
        ctx.lineTo((i / 255) * W, H - (data[i] / max) * (H - 6));
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, [hist]);

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Colour distribution per channel. Combing or unnatural spikes can indicate pixel-value
        manipulation.
      </p>
      <canvas ref={canvasRef} className="w-full rounded-xl border border-border bg-black/40" />
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="text-danger">■ Red</span>
        <span className="text-success">■ Green</span>
        <span className="text-[rgb(96,165,250)]">■ Blue</span>
      </div>
    </div>
  );
}

// --- Bit-plane viewer ------------------------------------------------------------
function BitPlaneTool({ img }: { img: LoadedImage }) {
  const [channel, setChannel] = useState<Channel>(0);
  const [bit, setBit] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) renderBitPlane(img, channel, bit, canvasRef.current);
  }, [img, channel, bit]);

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Each pixel's bits, one plane at a time. Plane 0 (the LSB) of a clean photo looks like
        noise with visible structure; embedded ciphertext looks like pure static.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-surface-2/60 p-1">
          {(["R", "G", "B"] as const).map((c, i) => (
            <button
              key={c}
              onClick={() => setChannel(i as Channel)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                channel === i ? "bg-accent/20 text-content" : "text-muted hover:text-content",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl bg-surface-2/60 p-1">
          {Array.from({ length: 8 }, (_, i) => (
            <button
              key={i}
              onClick={() => setBit(i)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 font-mono text-xs",
                bit === i ? "bg-accent/20 text-content" : "text-muted hover:text-content",
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full rounded-xl border border-border" />
    </div>
  );
}

// --- LSB visualization ------------------------------------------------------------
function LsbTool({ img }: { img: LoadedImage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) renderLsbVisualization(img, canvasRef.current);
  }, [img]);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        All three least-significant bits amplified to full brightness. Uniform static across the
        whole frame — instead of following the image's structure — suggests embedded data.
      </p>
      <canvas ref={canvasRef} className="w-full rounded-xl border border-border" />
    </div>
  );
}

// --- Image comparison ----------------------------------------------------------------
function CompareTool({ img, file }: { img: LoadedImage; file: File }) {
  const [otherFile, setOtherFile] = useState<File | null>(null);
  const [other, setOther] = useState<LoadedImage | null>(null);
  const [changedPct, setChangedPct] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!otherFile) {
      setOther(null);
      setChangedPct(null);
      return;
    }
    loadImageData(otherFile).then(setOther).catch(() => toast.error("Could not read image"));
  }, [otherFile]);

  useEffect(() => {
    if (other && canvasRef.current) {
      const { changedPct } = renderDiff(img, other, canvasRef.current);
      setChangedPct(changedPct);
    }
  }, [img, other]);

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Compare <span className="font-medium text-content">{file.name}</span> against a second
        image (e.g. the original cover) — differences are amplified 16×.
      </p>
      <Dropzone file={otherFile} onFile={setOtherFile} hint="Drop the image to compare against" />
      {other && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
          {changedPct !== null && (
            <p className="mb-2 text-sm">
              <Chip tone={changedPct > 0.5 ? "warning" : "success"}>
                {changedPct.toFixed(2)}% of pixels differ
              </Chip>
            </p>
          )}
          <canvas ref={canvasRef} className="w-full rounded-xl border border-border bg-black" />
        </motion.div>
      )}
    </div>
  );
}

// --- Metadata / integrity ----------------------------------------------------------------
function InfoTool({ img, file }: { img: LoadedImage; file: File }) {
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    setHash(null);
    file.arrayBuffer().then((buf) => sha256Hex(buf).then(setHash));
  }, [file]);

  return (
    <div className="space-y-3">
      <Row label="Filename">{file.name}</Row>
      <Row label="MIME type">{file.type || "unknown"}</Row>
      <Row label="File size">{formatBytes(file.size)}</Row>
      <Row label="Dimensions">{`${img.width}×${img.height}${img.width === 1400 || img.height === 1400 ? " (analysis scale)" : ""}`}</Row>
      <Row label="Last modified">{formatDateTime(new Date(file.lastModified).toISOString())}</Row>
      <div>
        <p className="label">SHA-256 (file integrity)</p>
        {hash ? (
          <button
            onClick={async () =>
              (await copyToClipboard(hash))
                ? toast.success("Hash copied")
                : toast.error("Copy failed")
            }
            className="flex w-full items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2.5 text-left font-mono text-xs hover:bg-surface-2"
          >
            <span className="break-all">{hash}</span>
            <Copy className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />
          </button>
        ) : (
          <p className="text-sm text-muted">Computing…</p>
        )}
      </div>
      <p className="text-xs text-muted">
        Share the hash out-of-band so the recipient can confirm the file wasn't modified in
        transit. Note: messaging apps that re-compress images will change it — and destroy any
        LSB payload.
      </p>
    </div>
  );
}

// --- Shared bits -----------------------------------------------------------------------
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="truncate font-medium">{children}</span>
    </div>
  );
}

function Metric({ label, value, bar }: { label: string; value: string; bar: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-medium">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(bar * 100, 100)}%` }}
          transition={{ duration: 0.6 }}
          className="h-full rounded-full bg-gradient-to-r from-accent to-cyan"
        />
      </div>
    </div>
  );
}

// --- Page -------------------------------------------------------------------------------
export default function Forensics() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<LoadedImage | null>(null);
  const [tool, setTool] = useState<Tool>("analyzer");

  useEffect(() => {
    if (!file) {
      setImg(null);
      return;
    }
    loadImageData(file)
      .then(setImg)
      .catch(() => toast.error("Could not decode this image"));
  }, [file]);

  return (
    <div>
      <PageHeader
        title="Forensics lab"
        subtitle="Inspect images for hidden data: statistics, bit planes, histograms and diffs."
      />

      <div className="grid gap-fluid lg:grid-cols-[clamp(15rem,24vw,20rem),minmax(0,1fr)]">
        <div className="space-y-fluid">
          <Card>
            <label className="label">Image under inspection</label>
            <Dropzone file={file} onFile={setFile} />
          </Card>
          <Card className="p-2">
            <nav className="grid grid-cols-3 gap-1 lg:grid-cols-1">
              {tools.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTool(t.key)}
                  disabled={!file}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40",
                    tool === t.key
                      ? "bg-accent/15 text-content ring-1 ring-accent/30"
                      : "text-muted hover:bg-white/5 hover:text-content",
                  )}
                >
                  <t.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </nav>
          </Card>
        </div>

        <Card>
          {!file || !img ? (
            <div className="grid min-h-[320px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10">
                  <FileSearch className="h-8 w-8 text-accent" />
                </div>
                <h3 className="font-display text-lg font-semibold">Drop an image to begin</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                  Six tools to decide whether an image is hiding something: a statistical
                  analyzer, histogram, bit-plane and LSB viewers, comparison and integrity
                  checks.
                </p>
              </div>
            </div>
          ) : (
            <>
              {tool === "analyzer" && <AnalyzerTool file={file} />}
              {tool === "histogram" && <HistogramTool img={img} />}
              {tool === "bitplane" && <BitPlaneTool img={img} />}
              {tool === "lsb" && <LsbTool img={img} />}
              {tool === "compare" && <CompareTool img={img} file={file} />}
              {tool === "info" && <InfoTool img={img} file={file} />}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
