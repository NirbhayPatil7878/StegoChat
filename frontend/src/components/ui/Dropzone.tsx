import { motion } from "framer-motion";
import { ImageIcon, UploadCloud, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";

interface Props {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  hint?: string;
}

export function Dropzone({ file, onFile, accept = "image/*", hint }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isImage = !!file && file.type.startsWith("image/");
  const preview = isImage ? URL.createObjectURL(file) : null;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  if (file) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border">
        {preview && (
          <img
            src={preview}
            alt="preview"
            className="max-h-[min(18rem,38vh)] w-full bg-surface-2/50 object-contain"
          />
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface/80 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <ImageIcon className="h-4 w-4 shrink-0 text-accent" />
            <span className="truncate text-sm">{file.name}</span>
            <span className="shrink-0 text-xs text-muted">
              {formatBytes(file.size)}
            </span>
          </div>
          <button
            onClick={() => onFile(null)}
            className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-danger"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-[clamp(1rem,2vw,1.5rem)] py-[clamp(1.5rem,5vh,3rem)] text-center transition-colors",
        dragging
          ? "border-accent bg-accent/10"
          : "border-border hover:border-accent/50 hover:bg-white/[0.02]",
      )}
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/10">
        <UploadCloud className="h-7 w-7 text-accent" />
      </div>
      <div>
        <p className="font-medium">
          Drop an image or <span className="text-accent">browse</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {hint || "PNG, JPG, BMP up to 10 MB"}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </motion.div>
  );
}
