// src/lib/ocrTwoPass.ts
// Avalon leaderboard OCR – separator version (wider crops + contrast)

import Tesseract from "tesseract.js";

/* ------------------------ tiny helpers ------------------------ */

const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
};

const imageToCanvas = (img: HTMLImageElement): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
};

const cropCanvas = (
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): HTMLCanvasElement => {
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
};

/**
 * quick contrast boost:
 *  - convert to gray
 *  - push dark pixels darker, light pixels lighter
 */
const boostContrast = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // simple linear boost tuned for beige/brown
  const gain = 1.35;
  for (let i = 0; i < data.length; i += 4) {
    // gray
    const g = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
    // center around 128 and stretch
    let v = (g - 128) * gain + 128;
    if (v < 0) v = 0;
    if (v > 255) v = 255;
    data[i] = data[i + 1] = data[i + 2] = v;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
};

/* -------------------- separator detection --------------------- */

const detectSeparatorLines = (canvas: HTMLCanvasElement): number[] => {
  const h = canvas.height;
  const w = canvas.width;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, w, h).data;

  // we made this more forgiving
  const DARK_THRESHOLD = 90;
  const MIN_RUN = 3;

  const seps: number[] = [];
  let runStart = -1;

  const lumAt = (i: number) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  for (let y = 0; y < h; y++) {
    let sum = 0;
    let samples = 0;
    for (let x = 0; x < w; x += 8) {
      const idx = (y * w + x) * 4;
      sum += lumAt(idx);
      samples++;
    }
    const avg = sum / samples;
    const isDark = avg < DARK_THRESHOLD;

    if (isDark) {
      if (runStart === -1) runStart = y;
    } else if (runStart !== -1) {
      const runLen = y - runStart;
      if (runLen >= MIN_RUN) {
        const mid = Math.floor((runStart + y) / 2);
        seps.push(mid);
      }
      runStart = -1;
    }
  }

  if (runStart !== -1) {
    const runLen = h - runStart;
    if (runLen >= MIN_RUN) {
      const mid = Math.floor((runStart + h) / 2);
      seps.push(mid);
    }
  }

  return seps;
};

const makeRowRects = (
  canvas: HTMLCanvasElement,
  seps: number[]
): Array<{ y: number; height: number }> => {
  const h = canvas.height;
  const rows: Array<{ y: number; height: number }> = [];

  if (seps.length === 0) {
    rows.push({ y: 0, height: h });
    return rows;
  }

  // top chunk
  if (seps[0] > 12) {
    rows.push({ y: 0, height: seps[0] - 4 });
  }

  for (let i = 0; i < seps.length - 1; i++) {
    const top = seps[i] + 4;
    const bottom = seps[i + 1] - 4;
    if (bottom > top + 12) {
      rows.push({ y: top, height: bottom - top });
    }
  }

  // bottom chunk
  const last = seps[seps.length - 1];
  if (h - last > 14) {
    rows.push({ y: last + 4, height: h - (last + 4) });
  }

  return rows.filter((r) => r.height > 26);
};

/* ----------------------- OCR wrapper -------------------------- */

const recognizeCanvas = async (
  canvas: HTMLCanvasElement,
  psm: number,
  allowlist?: string
): Promise<{ text: string; confidence: number }> => {
  // boost contrast before sending to tesseract
  const boosted = boostContrast(canvas);
  const dataUrl = boosted.toDataURL("image/png");

  const { data } = await Tesseract.recognize(dataUrl, "eng", {
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: allowlist,
  } as any);

  return {
    text: data?.text || "",
    confidence: data?.confidence || 0,
  };
};

/* ----------------------- MAIN EXPORT -------------------------- */

export const runAvalonLeaderboardOCR = async (file: File): Promise<any[]> => {
  const img = await loadImageFromFile(file);
  const base = imageToCanvas(img);

  const seps = detectSeparatorLines(base);
  const rowRects = makeRowRects(base, seps);

  const out: any[] = [];

  for (const rect of rowRects) {
    // row slice, padded a little vertically
    const padY = 2;
    const rowCanvas = cropCanvas(
      base,
      0,
      Math.max(0, rect.y - padY),
      base.width,
      Math.min(base.height - rect.y + padY, rect.height + padY * 2)
    );

    // wider name and score regions
    const totalW = base.width;
    const nameX = 4; // start almost at the left
    const nameW = Math.floor(totalW * 0.5); // give it half
    const scoreW = Math.floor(totalW * 0.38); // slightly wider than before
    const scoreX = totalW - scoreW - 6;

    const nameCanvas = cropCanvas(rowCanvas, nameX, 0, nameW, rowCanvas.height);
    const scoreCanvas = cropCanvas(rowCanvas, scoreX, 0, scoreW, rowCanvas.height);

    // OCR
    const nameRes = await recognizeCanvas(nameCanvas, 7 /* single line */);
    const scoreRes = await recognizeCanvas(
      scoreCanvas,
      7,
      "0123456789,"
    );

    const rawScore = (scoreRes.text || "").replace(/\s+/g, "");
    const digitsOnly = rawScore.replace(/[^\d]/g, "");
    const parsedScore = digitsOnly ? parseInt(digitsOnly, 10) : 0;

    // confidence: bias toward name
    const nameConf = (nameRes.confidence || 0) / 100;
    const scoreConf = (scoreRes.confidence || 0) / 100;
    const combined = Math.min(1, nameConf * 0.7 + scoreConf * 0.3);

    out.push({
      parsedName: (nameRes.text || "").trim(),
      parsedScore,
      bigScore: digitsOnly || "0",
      confidence: combined,
      rawText: `${nameRes.text || ""} | ${scoreRes.text || ""}`,
      imageSource: file.name,
      metadata: {
        nameConfidence: nameConf,
        scoreConfidence: scoreConf,
        rawScoreText: rawScore,
        nameCanvas,
        scoreCanvas,
        originalWidth: base.width,
        originalHeight: base.height,
        processedWidth: base.width,
        processedHeight: base.height,
        scaleFactor: 1,
      },
    });
  }

  return out;
};
