/**
 * OCR Image Preprocessing Utilities
 * Handles resolution preservation, smart scaling, and image enhancement
 */

export interface PreprocessedImage {
  canvas: HTMLCanvasElement;            // binarized / high-contrast → good for scores
  grayscaleCanvas: HTMLCanvasElement;   // detail-preserved → good for names
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  scaleFactor: number;
}

/**
 * Load image from File at original resolution (no CSS downscale)
 */
export const loadImageAtOriginalResolution = async (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
};

/**
 * Calculate optimal scale factor based on image dimensions
 */
export const calculateOptimalScale = (width: number, scaleOverride?: number): number => {
  if (scaleOverride) return scaleOverride;

  // Small images: upscale
  if (width < 1200) {
    const targetScale = Math.min(width * 2.5, 2600) / width;
    return targetScale;
  }

  // Large images: downscale to stable range
  if (width > 3800) {
    return 2800 / width;
  }

  // Medium images: no scaling
  return 1.0;
};

export interface PreprocessResult {
  canvas: HTMLCanvasElement;
  confidence: number;
  pipelineUsed: 'colorMask' | 'grayscale';
}

/**
 * Color mask pipeline (extracts brown text on beige)
 */
export const preprocessColorMask = (
  sourceCanvas: HTMLCanvasElement,
  aggressiveThreshold: boolean = false
): PreprocessResult => {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = imageData.data;

  // Step 1: Compute R-G (red minus green for brown text)
  for (let i = 0; i < data.length; i += 4) {
    const rMinusG = Math.max(0, data[i] - data[i + 1]);
    data[i] = data[i + 1] = data[i + 2] = rMinusG;
  }

  // Step 2: Normalize to [0..255]
  let maxVal = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > maxVal) maxVal = data[i];
  }
  if (maxVal > 0) {
    for (let i = 0; i < data.length; i += 4) {
      const normalized = (data[i] / maxVal) * 255;
      data[i] = data[i + 1] = data[i + 2] = normalized;
    }
  }

  // Step 3: Contrast boost
  const gain = aggressiveThreshold ? 1.5 : 1.25;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * gain + 128));
    data[i + 1] = data[i];
    data[i + 2] = data[i];
  }

  // Step 4: Otsu threshold — BUT this is the brittle part
  const threshold = calculateOtsuThreshold(data);
  const separationScore = threshold / 255; // crude measure of how separated we are

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);

  // If separationScore is too low/high, we know it wasn't a great split
  const confidence = separationScore > 0.2 && separationScore < 0.8 ? 0.75 : 0.4;

  return { canvas: sourceCanvas, confidence, pipelineUsed: 'colorMask' };
};

/**
 * Grayscale pipeline (traditional)
 */
export const preprocessGrayscale = (
  sourceCanvas: HTMLCanvasElement,
  aggressiveThreshold: boolean = false,
  binarize: boolean = true
): PreprocessResult => {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = imageData.data;

  // Step 1: Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  // Step 2: Contrast stretch
  const gain = aggressiveThreshold ? 1.4 : 1.3;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * gain + 128));
    data[i + 1] = data[i];
    data[i + 2] = data[i];
  }

  if (binarize) {
    // Step 3: Otsu threshold
    const threshold = calculateOtsuThreshold(data);
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);
    return { canvas: sourceCanvas, confidence: 0.5, pipelineUsed: 'grayscale' };
  } else {
    // Sharpen for non-binarized (NAME pass)
    const sharpened = applyUnsharpMask(imageData, sourceCanvas.width, sourceCanvas.height, 1, 0.6);
    ctx.putImageData(sharpened, 0, 0);
    return { canvas: sourceCanvas, confidence: 0.5, pipelineUsed: 'grayscale' };
  }
};

/**
 * Apply image preprocessing: choose best pipeline
 * Try colorMask first for brown-on-beige, fall back to grayscale
 */
export const preprocessImageCanvas = (
  sourceCanvas: HTMLCanvasElement,
  aggressiveThreshold: boolean = false
): HTMLCanvasElement => {
  // We make a clone because both pipelines mutate the canvas
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = sourceCanvas.width;
  colorCanvas.height = sourceCanvas.height;
  const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true })!;
  colorCtx.drawImage(sourceCanvas, 0, 0);

  const colorResult = preprocessColorMask(colorCanvas, aggressiveThreshold);

  // if good enough, use it
  if (colorResult.confidence >= 0.7) {
    return colorResult.canvas;
  }

  // else fall back to grayscale
  const grayResult = preprocessGrayscale(sourceCanvas, aggressiveThreshold, true);
  return grayResult.canvas;
};

/**
 * Calculate Otsu threshold for binarization
 */
const calculateOtsuThreshold = (data: Uint8ClampedArray): number => {
  const histogram = new Array(256).fill(0);

  // Build histogram
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  const total = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;

    wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
};

/**
 * Apply unsharp mask for edge enhancement
 */
const applyUnsharpMask = (
  imageData: ImageData,
  width: number,
  height: number,
  radius: number = 1,
  amount: number = 0.6
): ImageData => {
  const data = imageData.data;
  const output = new ImageData(width, height);
  const outData = output.data;

  // Simple box blur for gaussian approximation
  const blurred = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            sum += data[idx];
            count++;
          }
        }
      }

      const idx = (y * width + x) * 4;
      blurred[idx] = sum / count;
    }
  }

  // Unsharp: original + amount * (original - blurred)
  for (let i = 0; i < data.length; i += 4) {
    const sharpened = data[i] + amount * (data[i] - blurred[i]);
    outData[i] = outData[i + 1] = outData[i + 2] = Math.min(255, Math.max(0, sharpened));
    outData[i + 3] = 255;
  }

  return output;
};

/**
 * Preprocess image file with smart scaling and enhancement
 */
export const preprocessImageFile = async (
  file: File,
  scaleOverride?: number,
  aggressiveThreshold: boolean = false
): Promise<PreprocessedImage> => {
  const img = await loadImageAtOriginalResolution(file);

  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;
  const scaleFactor = calculateOptimalScale(originalWidth, scaleOverride);

  const processedWidth = Math.round(originalWidth * scaleFactor);
  const processedHeight = Math.round(originalHeight * scaleFactor);

  // Create base canvas
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = processedWidth;
  baseCanvas.height = processedHeight;
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true })!;
  baseCtx.imageSmoothingEnabled = true;
  baseCtx.imageSmoothingQuality = 'high';
  baseCtx.drawImage(img, 0, 0, processedWidth, processedHeight);

  // 1) Binarized / high-contrast canvas → good for scores
  const thresholdedCanvas = preprocessImageCanvas(baseCanvas, aggressiveThreshold);

  // 2) Detail-preserved canvas → good for names (grayscale, no binarize)
  const grayscaleCanvas = document.createElement('canvas');
  grayscaleCanvas.width = processedWidth;
  grayscaleCanvas.height = processedHeight;
  const grayscaleCtx = grayscaleCanvas.getContext('2d', { willReadFrequently: true })!;
  grayscaleCtx.imageSmoothingEnabled = true;
  grayscaleCtx.imageSmoothingQuality = 'high';
  grayscaleCtx.drawImage(img, 0, 0, processedWidth, processedHeight);
  preprocessGrayscale(grayscaleCanvas, aggressiveThreshold, false);

  return {
    canvas: thresholdedCanvas,
    grayscaleCanvas,
    originalWidth,
    originalHeight,
    processedWidth,
    processedHeight,
    scaleFactor,
  };
};
