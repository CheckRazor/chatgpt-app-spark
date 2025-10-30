// src/lib/ocrSmartSegment.ts
// Browser-only helper for Avalon beige/brown leaderboard OCR

import { createWorker, Worker } from "tesseract.js";

// we keep 1 worker for the whole session
let sharedWorker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (sharedWorker) return sharedWorker;
  // keep it simple: english only
  sharedWorker = await createWorker("eng");
  return sharedWorker;
}

export interface SmartOCRRow {
  parsedName: string;
  parsedScore: number;
  bigScore: string;
  rawText: string;
  confidence: number;
  imageSource: string;
  metadata?: {
    nameConfidence?: number;
    scoreConfidence?: number;
    nameCanvas?: HTMLCanvasElement;
    scoreCanvas?: HTMLCanvasElement;
    originalWidth?: number;
    originalHeight?: number;
    processedWidth?: number;
    processedHeight?: number;
    scaleFactor?: number;
  };
}

interface Segment {
  y: number;
  h: number;
}

/**
 * 1. clone image into canvas
 */
function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return c;
}

/**
 * 2. upscale small screenshots (yours are ~500px wide)
 */
function upscaleCanvas(
  src: HTMLCanvasElement,
  targetWidth = 1240
): HTMLCanvasElement {
  if (src.width >= targetWidth) return src;
  const scale = targetWidth / src.width;
  const c = document.createElement("canvas");
  c.width = targetWidth;
  c.height = Math.round(src.height * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * 3. find beige bands separated by dark bar
 * strategy:
 *  - scan each row (y)
 *  - compute avg brightness
 *  - dark bar ≈ brightness < 80, but only if it spans most of the width
 */
function detectBeigeSegments(
  canvas: HTMLCanvasElement
): Segment[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height).data;

  const rowBrightness: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = img[i];
      const g = img[i + 1];
      const b = img[i + 2];
      // skip far right tiny artifacts
      if (x > width - 12) continue;
      const br = (r + g + b) / 3;
      sum += br;
      count++;
    }
    rowBrightness[y] = sum / Math.max(1, count);
  }

  // dark lines (dividers) usually around 35–75 brightness
  const DARK = 80;
  const segments: Segment[] = [];
  let start = 0;

  for (let y = 0; y < height; y++) {
    const br = rowBrightness[y];
    const isDark = br < DARK;
    if (isDark) {
      // close previous beige band
      const h = y - start;
      if (h > 25) {
        // keep only real beige content
        segments.push({ y: start, h });
      }
      // next band starts after dark line
      start = y + 1;
    }
  }
  // last band
  if (height - start > 25) {
    segments.push({ y: start, h: height - start });
  }

  // hard cap to 20 rows (your use case)
  return segments.slice(0, 20);
}

/**
 * 4. crop helper
 */
function cropCanvas(
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

/**
 * 5. split row → name (left) / score (right)
 * on your screenshots: name is ~ 0–55%, score is rightmost
 */
function splitRow(
  rowCanvas: HTMLCanvasElement
): { nameCanvas: HTMLCanvasElement; scoreCanvas: HTMLCanvasElement } {
  const splitX = Math.round(rowCanvas.width * 0.55);
  const nameCanvas = cropCanvas(rowCanvas, 0, 0, splitX, rowCanvas.height);
  // remove 4px right noise
  const scoreWidth = rowCanvas.width - splitX - 4;
  const scoreCanvas = cropCanvas(
    rowCanvas,
    splitX,
    0,
    scoreWidth,
    rowCanvas.height
  );
  return { nameCanvas, scoreCanvas };
}

/**
 * 6. binarize score area → white text on black
 */
function binarizeForScore(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = c;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;

  // find min/max
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mid = (min + max) / 2;

  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const out = v > mid ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = out;
    data[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * 7. OCR name
 */
async function ocrName(
  canvas: HTMLCanvasElement,
  worker: Worker
): Promise<{ text: string; conf: number }> {
  await worker.setParameters({
    tessedit_pageseg_mode: "6", // single block of text
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .'_-",
  } as any);
  const { data } = await worker.recognize(canvas);
  return {
    text: (data.text || "").trim(),
    conf: (data.confidence || 0) / 100,
  };
}

/**
 * 8. OCR score
 */
async function ocrScore(
  canvas: HTMLCanvasElement,
  worker: Worker
): Promise<{ text: string; conf: number }> {
  const bin = binarizeForScore(canvas);
  await worker.setParameters({
    tessedit_pageseg_mode: "7", // single line
    tessedit_char_whitelist: "0123456789,",
  } as any);
  const { data } = await worker.recognize(bin);
  let raw = (data.text || "").trim();
  raw = raw.replace(/[^\d,]/g, "");
  return {
    text: raw,
    conf: (data.confidence || 0) / 100,
  };
}

/**
 * 9. normalize score → bigint string + number (capped)
 */
function normalizeScore(raw: string): { num: number; big: string } {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return { num: 0, big: "0" };
  const num = parseInt(digits.slice(0, 10), 10); // safe number for UI
  return { num: isNaN(num) ? 0 : num, big: digits };
}

/**
 * PUBLIC: run OCR on ONE <img>
 */
export async function runSmartLeaderboardOCR(
  img: HTMLImageElement,
  sourceName: string
): Promise<SmartOCRRow[]> {
  const baseCanvas = imageToCanvas(img);
  const scaled = upscaleCanvas(baseCanvas, 1240);

  const segments = detectBeigeSegments(scaled);
  if (!segments.length) return [];

  const worker = await getWorker();

  const out: SmartOCRRow[] = [];

  for (const seg of segments) {
    const rowCanvas = cropCanvas(scaled, 0, seg.y, scaled.width, seg.h);
    const { nameCanvas, scoreCanvas } = splitRow(rowCanvas);

    const [nameRes, scoreRes] = await Promise.all([
      ocrName(nameCanvas, worker),
      ocrScore(scoreCanvas, worker),
    ]);

    const norm = normalizeScore(scoreRes.text);

    // overall confidence = weighted
    const overall =
      nameRes.conf > 0 && scoreRes.conf > 0
        ? (nameRes.conf * 0.6 + scoreRes.conf * 0.4)
        : Math.max(nameRes.conf, scoreRes.conf);

    // ignore rows that are clearly garbage
    if (!nameRes.text && !norm.big) continue;

    out.push({
      parsedName: nameRes.text,
      parsedScore: norm.num,
      bigScore: norm.big,
      rawText: `${nameRes.text} ${scoreRes.text}`.trim(),
      confidence: overall,
      imageSource: sourceName,
      metadata: {
        nameConfidence: nameRes.conf,
        scoreConfidence: scoreRes.conf,
        nameCanvas,
        scoreCanvas,
        originalWidth: baseCanvas.width,
        originalHeight: baseCanvas.height,
        processedWidth: scaled.width,
        processedHeight: scaled.height,
        scaleFactor: scaled.width / baseCanvas.width,
      },
    });
  }

  return out;
}
