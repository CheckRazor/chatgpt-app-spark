/**
 * Two-Pass OCR: Row Segmentation + Name/Score Split
 */

import { createWorker, Worker } from 'tesseract.js';

export interface RowSegment {
  y: number;
  height: number;
  canvas: HTMLCanvasElement;
}

export interface TwoPassResult {
  name: string;
  score: string;
  nameConfidence: number;
  scoreConfidence: number;
  nameCanvas: HTMLCanvasElement;
  scoreCanvas: HTMLCanvasElement;
}

let sharedWorker: Worker | null = null;

/**
 * Get or create shared Tesseract worker
 */
export const getSharedWorker = async (): Promise<Worker> => {
  if (!sharedWorker) {
    sharedWorker = await createWorker('eng', 1);
  }
  return sharedWorker;
};

/**
 * Terminate shared worker
 */
export const terminateSharedWorker = async (): Promise<void> => {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
};

/**
 * Segment image into horizontal row bands using projection profiling
 */
export const segmentRows = (canvas: HTMLCanvasElement): RowSegment[] => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Calculate horizontal projection (white pixel count per row)
  const projection = new Array(canvas.height).fill(0);
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      // Count white pixels (text is black after threshold)
      if (data[idx] === 255) {
        projection[y]++;
      }
    }
  }
  
  // Find text bands (regions with significant white pixels)
  const threshold = canvas.width * 0.05; // At least 5% of row has text
  const segments: RowSegment[] = [];
  let inBand = false;
  let bandStart = 0;
  
  for (let y = 0; y < canvas.height; y++) {
    const hasText = projection[y] > threshold;
    
    if (hasText && !inBand) {
      // Start of new band
      bandStart = Math.max(0, y - 5); // Add padding
      inBand = true;
    } else if (!hasText && inBand) {
      // End of band
      const bandEnd = Math.min(canvas.height, y + 5); // Add padding
      const height = bandEnd - bandStart;
      
      if (height > 20) { // Minimum height filter
        segments.push({
          y: bandStart,
          height,
          canvas: cropCanvas(canvas, 0, bandStart, canvas.width, height),
        });
      }
      
      inBand = false;
    }
  }
  
  // Handle case where band extends to end
  if (inBand) {
    const height = canvas.height - bandStart;
    if (height > 20) {
      segments.push({
        y: bandStart,
        height,
        canvas: cropCanvas(canvas, 0, bandStart, canvas.width, height),
      });
    }
  }
  
  return segments;
};

/**
 * Crop canvas region
 */
const cropCanvas = (
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number
): HTMLCanvasElement => {
  const cropped = document.createElement('canvas');
  cropped.width = width;
  cropped.height = height;
  
  const ctx = cropped.getContext('2d')!;
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  
  return cropped;
};

/**
 * Split row canvas into name (left) and score (right) regions
 */
export const splitNameScore = (
  rowCanvas: HTMLCanvasElement,
  splitRatio: number = 0.70
): { nameCanvas: HTMLCanvasElement; scoreCanvas: HTMLCanvasElement } => {
  const splitX = Math.round(rowCanvas.width * splitRatio);
  
  const nameCanvas = cropCanvas(rowCanvas, 0, 0, splitX, rowCanvas.height);
  const scoreCanvas = cropCanvas(rowCanvas, splitX, 0, rowCanvas.width - splitX, rowCanvas.height);
  
  return { nameCanvas, scoreCanvas };
};

/**
 * Run OCR on name region (text mode)
 */
export const ocrNameRegion = async (
  canvas: HTMLCanvasElement,
  worker: Worker
): Promise<{ text: string; confidence: number }> => {
  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_char_whitelist: '',
  });
  
  const { data } = await worker.recognize(canvas, {
    rotateAuto: false,
  });
  
  return {
    text: data.text.trim(),
    confidence: data.confidence / 100,
  };
};

/**
 * Run OCR on score region (numeric mode)
 */
export const ocrScoreRegion = async (
  canvas: HTMLCanvasElement,
  worker: Worker
): Promise<{ text: string; confidence: number }> => {
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789,.',
    user_defined_dpi: '300',
    preserve_interword_spaces: '0',
  });
  
  const { data } = await worker.recognize(canvas, {
    rotateAuto: false,
  });
  
  return {
    text: data.text.trim(),
    confidence: data.confidence / 100,
  };
};

/**
 * Two-pass OCR on a single row
 */
export const twoPassOCRRow = async (
  rowCanvas: HTMLCanvasElement,
  worker: Worker,
  splitRatio: number = 0.70
): Promise<TwoPassResult> => {
  const { nameCanvas, scoreCanvas } = splitNameScore(rowCanvas, splitRatio);
  
  const [nameResult, scoreResult] = await Promise.all([
    ocrNameRegion(nameCanvas, worker),
    ocrScoreRegion(scoreCanvas, worker),
  ]);
  
  return {
    name: nameResult.text,
    score: scoreResult.text,
    nameConfidence: nameResult.confidence,
    scoreConfidence: scoreResult.confidence,
    nameCanvas,
    scoreCanvas,
  };
};

/**
 * Process entire image with two-pass OCR
 */
export const processTwoPassOCR = async (
  canvas: HTMLCanvasElement,
  splitRatio: number = 0.70,
  progressCallback?: (current: number, total: number) => void
): Promise<TwoPassResult[]> => {
  const worker = await getSharedWorker();
  
  // Segment into rows
  let segments = segmentRows(canvas);
  
  // Fallback: if no rows found, try simple full-page split
  if (segments.length === 0) {
    segments = [{
      y: 0,
      height: canvas.height,
      canvas,
    }];
  }
  
  const results: TwoPassResult[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    try {
      const result = await twoPassOCRRow(segments[i].canvas, worker, splitRatio);
      
      // Only include if we got at least a name
      if (result.name.length > 0) {
        results.push(result);
      }
      
      if (progressCallback) {
        progressCallback(i + 1, segments.length);
      }
    } catch (error) {
      console.error(`Failed to OCR row ${i}:`, error);
    }
  }
  
  return results;
};
