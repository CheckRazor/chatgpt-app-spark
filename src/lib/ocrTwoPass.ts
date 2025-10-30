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
 * Smooth projection profile
 */
const smoothProjection = (projection: number[], windowSize: number = 9): number[] => {
  const smoothed = new Array(projection.length).fill(0);
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < projection.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - halfWindow); j < Math.min(projection.length, i + halfWindow + 1); j++) {
      sum += projection[j];
      count++;
    }
    smoothed[i] = sum / count;
  }
  
  return smoothed;
};

/**
 * Find valleys (separators) in projection profile
 * Dark divider lines appear as HIGH values in dark pixel count
 */
const findValleys = (projection: number[], minGap: number = 6): number[] => {
  const valleys: number[] = [];
  const maxVal = Math.max(...projection);
  const avgVal = projection.reduce((a, b) => a + b, 0) / projection.length;
  
  // Look for peaks (dark lines) rather than valleys
  const threshold = Math.max(avgVal * 1.5, maxVal * 0.3);
  
  let inPeak = false;
  let peakStart = 0;
  let peakMax = 0;
  let peakMaxIdx = 0;
  
  for (let i = 0; i < projection.length; i++) {
    if (projection[i] > threshold && !inPeak) {
      peakStart = i;
      peakMax = projection[i];
      peakMaxIdx = i;
      inPeak = true;
    } else if (inPeak) {
      if (projection[i] > peakMax) {
        peakMax = projection[i];
        peakMaxIdx = i;
      }
      if (projection[i] < threshold) {
        // End of peak - record the maximum point
        valleys.push(peakMaxIdx);
        inPeak = false;
      }
    }
  }
  
  // Merge close valleys
  const merged: number[] = [];
  for (let i = 0; i < valleys.length; i++) {
    if (merged.length === 0 || valleys[i] - merged[merged.length - 1] > minGap) {
      merged.push(valleys[i]);
    }
  }
  
  return merged;
};

/**
 * Segment image into horizontal row bands using robust projection profiling
 * For Plarium leaderboards: detect dark divider lines between rows
 */
export const segmentRows = (
  canvas: HTMLCanvasElement,
  grayscaleCanvas: HTMLCanvasElement,
  expectedRows?: number
): RowSegment[] => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Calculate horizontal projection (dark pixel count per row)
  const projection = new Array(canvas.height).fill(0);
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      // Count dark pixels (divider lines are dark)
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < 100) {
        projection[y]++;
      }
    }
  }
  
  // Smooth projection
  const smoothed = smoothProjection(projection, 9);
  
  // Find valleys
  const valleys = findValleys(smoothed, 6);
  
  // Build segments from valleys (dark divider lines)
  const minHeight = 55;
  const segments: RowSegment[] = [];
  
  if (valleys.length >= 1 && (!expectedRows || valleys.length + 1 === expectedRows)) {
    // Use valleys to define bands
    let prevY = 0;
    for (const valley of valleys) {
      const rowHeight = valley - prevY;
      if (rowHeight >= minHeight) {
        // Crop top 80% of band to remove bottom noise line
        const cropHeight = Math.floor(rowHeight * 0.8);
        if (cropHeight >= minHeight) {
          segments.push({
            y: prevY,
            height: cropHeight,
            canvas: cropCanvas(grayscaleCanvas, 0, prevY, canvas.width, cropHeight),
          });
        }
      }
      prevY = valley;
    }
    // Last segment
    const rowHeight = canvas.height - prevY;
    if (rowHeight >= minHeight) {
      const cropHeight = Math.floor(rowHeight * 0.8);
      if (cropHeight >= minHeight) {
        segments.push({
          y: prevY,
          height: cropHeight,
          canvas: cropCanvas(grayscaleCanvas, 0, prevY, canvas.width, cropHeight),
        });
      }
    }
  }
  
  // Fallback: if no valid segments or count doesn't match expected
  if (segments.length === 0 || (expectedRows && segments.length !== expectedRows)) {
    const targetRows = expectedRows || 5; // Default to 5 for Plarium screenshots
    const sliceHeight = canvas.height / targetRows;
    
    segments.length = 0;
    for (let i = 0; i < targetRows; i++) {
      const idealY = Math.round(i * sliceHeight);
      // Snap to nearest valley within ±20px
      let snapY = idealY;
      let minDist = 20;
      for (const valley of valleys) {
        const dist = Math.abs(valley - idealY);
        if (dist < minDist) {
          minDist = dist;
          snapY = valley;
        }
      }
      
      const nextIdealY = Math.round((i + 1) * sliceHeight);
      let snapNextY = nextIdealY;
      minDist = 20;
      for (const valley of valleys) {
        const dist = Math.abs(valley - nextIdealY);
        if (dist < minDist) {
          minDist = dist;
          snapNextY = valley;
        }
      }
      
      const rowHeight = snapNextY - snapY;
      if (rowHeight >= minHeight && snapNextY <= canvas.height) {
        // Crop top 80% of band
        const cropHeight = Math.floor(rowHeight * 0.8);
        if (cropHeight >= minHeight) {
          segments.push({
            y: snapY,
            height: cropHeight,
            canvas: cropCanvas(grayscaleCanvas, 0, snapY, canvas.width, cropHeight),
          });
        }
      }
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
 * Run OCR on name region (text mode with punctuation)
 * Uses non-thresholded grayscale to preserve brown text on beige
 */
export const ocrNameRegion = async (
  canvas: HTMLCanvasElement,
  worker: Worker
): Promise<{ text: string; confidence: number }> => {
  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .\'-:_†<>/\\',
    user_defined_dpi: '300',
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
  grayscaleCanvas: HTMLCanvasElement,
  splitRatio: number = 0.70,
  expectedRows?: number,
  progressCallback?: (current: number, total: number) => void
): Promise<TwoPassResult[]> => {
  const worker = await getSharedWorker();
  
  // Segment into rows using both thresholded and grayscale versions
  let segments = segmentRows(canvas, grayscaleCanvas, expectedRows);
  
  // Fallback: if no rows found, try simple full-page split
  if (segments.length === 0) {
    segments = [{
      y: 0,
      height: grayscaleCanvas.height,
      canvas: grayscaleCanvas,
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
