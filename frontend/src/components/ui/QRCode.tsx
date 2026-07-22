import { QRCodeCanvas } from "qrcode.react";
import { useRef } from "react";

/**
 * Renders `value` as a scannable QR code, entirely client-side (the value never
 * leaves the browser). Optional download saves the QR as a PNG.
 */
export function QRCode({
  value,
  size = 168,
  downloadName,
  className,
}: {
  value: string;
  size?: number;
  downloadName?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const download = () => {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = downloadName ?? "qr-code.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className={className}>
      <div
        ref={ref}
        className="inline-flex rounded-xl bg-white p-3 shadow-sm"
        title="Scan with a phone camera"
      >
        <QRCodeCanvas value={value} size={size} level="M" marginSize={0} />
      </div>
      {downloadName && (
        <button
          type="button"
          onClick={download}
          className="mt-2 block text-xs text-accent hover:underline"
        >
          Download QR
        </button>
      )}
    </div>
  );
}
