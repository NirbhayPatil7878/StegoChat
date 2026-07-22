/** Client-side canvas utilities for the forensics toolbox. */

export interface LoadedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

const MAX_DIM = 1400; // downscale huge images so analysis stays snappy

export async function loadImageData(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

export type Channel = 0 | 1 | 2; // R, G, B

/** 256-bucket histogram per RGB channel. */
export function histogram(img: LoadedImage): { r: number[]; g: number[]; b: number[] } {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
  }
  return { r, g, b };
}

/** Render a single bit plane of one channel as a black/white image. */
export function renderBitPlane(
  img: LoadedImage,
  channel: Channel,
  bit: number,
  canvas: HTMLCanvasElement,
) {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(img.width, img.height);
  const mask = 1 << bit;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i + channel] & mask ? 255 : 0;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

/** Amplify the LSBs of all channels into a false-colour visualization. */
export function renderLsbVisualization(img: LoadedImage, canvas: HTMLCanvasElement) {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = (img.data[i] & 1) * 255;
    out.data[i + 1] = (img.data[i + 1] & 1) * 255;
    out.data[i + 2] = (img.data[i + 2] & 1) * 255;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

/** Amplified per-pixel difference of two images (scaled to the smaller one). */
export function renderDiff(
  a: LoadedImage,
  b: LoadedImage,
  canvas: HTMLCanvasElement,
  gain = 16,
): { changedPct: number } {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(w, h);
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const io = (y * w + x) * 4;
      let any = false;
      for (let c = 0; c < 3; c++) {
        const diff = Math.abs(a.data[ia + c] - b.data[ib + c]);
        if (diff > 0) any = true;
        out.data[io + c] = Math.min(diff * gain, 255);
      }
      if (any) changed++;
      out.data[io + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return { changedPct: (changed / (w * h)) * 100 };
}
