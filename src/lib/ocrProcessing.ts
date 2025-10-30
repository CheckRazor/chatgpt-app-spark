/**
 * OCR Parsing and Accuracy Utilities (Improved for Beige/Brown Leaderboards)
 * -------------------------------------------------------------------------
 * - Smarter name/score extraction (variable rows, rightmost numeric match)
 * - BIGINT-safe parsing (string-based score handling)
 * - Tolerant of OCR artifacts like |, I, l, O, S mixups
 * - Backward-compatible with existing UI
 */

export interface OCRResult {
  parsedName: string;
  parsedScore: number;
  rawText: string;
  correctedValue: number | null;
  confidence: number;
  originalLine: string;
  bigScore?: string; // bigint-safe string version
}

/**
 * Auto-correct common OCR mistakes in numeric values (BIGINT support)
 */
export const correctNumericOCR = (
  text: string
): {
  value: number;
  corrected: boolean;
  confidence: number;
  rawText: string;
  bigValue: string;
} => {
  let corrected = false;
  let workingText = text.trim();
  const originalText = workingText;

  // Replace common character mistakes when surrounded by digits
  workingText = workingText.replace(/(\d)O(\d)/g, "$10$2"); // O -> 0
  workingText = workingText.replace(/(\d)S(\d)/g, "$15$2"); // S -> 5
  workingText = workingText.replace(/(\d)I(\d)/g, "$11$2"); // I -> 1
  workingText = workingText.replace(/(\d)l(\d)/g, "$11$2"); // l -> 1

  if (workingText !== originalText) corrected = true;

  // Remove spaces
  workingText = workingText.replace(/\s/g, "");

  // Fix malformed comma patterns (e.g., "2,5,00" -> "25,000")
  const malformedComma = /(\d),(\d),(\d{2,})/.exec(workingText);
  if (malformedComma) {
    workingText = workingText.replace(/,/g, "");
    const digits = workingText;
    const groups: string[] = [];
    for (let i = digits.length; i > 0; i -= 3) {
      groups.unshift(digits.slice(Math.max(0, i - 3), i));
    }
    workingText = groups.join(",");
    corrected = true;
  }

  // Auto-append missing zeros based on comma placement
  const commaPattern = /(\d+),(\d{1,2})$/.exec(workingText);
  if (commaPattern) {
    const afterComma = commaPattern[2];
    if (afterComma.length === 1) {
      workingText = workingText + "00";
      corrected = true;
    } else if (afterComma.length === 2) {
      workingText = workingText + "0";
      corrected = true;
    }
  }

  // Remove commas for final parsing
  const digitsOnly = workingText.replace(/[^\d]/g, "");
  const numericValue = parseInt(digitsOnly.slice(0, 10), 10); // keep old number for display

  // Confidence scoring
  let confidence = corrected ? 0.85 : 1.0;
  if (numericValue < 100) confidence *= 0.7;
  if (digitsOnly.length > 12) confidence *= 0.5;

  return {
    value: isNaN(numericValue) ? 0 : numericValue,
    bigValue: digitsOnly || "0",
    corrected,
    confidence: Math.max(0, Math.min(1, confidence)),
    rawText: originalText,
  };
};

/**
 * Parse comma-formatted number to BIGINT string
 */
export const parseScoreToBigInt = (text: string): string => {
  return text.replace(/[^\d]/g, "") || "0";
};

/**
 * Format bigint string as comma-separated
 */
export const formatBigIntWithCommas = (value: string): string => {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Parse OCR text into structured score entries with tolerant name/score detection
 * Handles variable row counts, messy OCR artifacts, and BIGINT-safe parsing.
 */
export const parseScoresFromText = (
  text: string,
  fileName: string,
  autoCorrect: boolean = true,
  strictMode: boolean = true
): OCRResult[] => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const results: OCRResult[] = [];

  for (const line of lines) {
    const originalLine = line;
    if (!line) continue;

    // 1) strip leading OCR junk
    const cleaned = line.replace(/^[|I1\.\-]+/, "").trim();
    if (!cleaned) continue;

    // 2) find the RIGHTMOST number (score)
    const numMatch = cleaned.match(/(\d[\d,\.]*)\s*$/);
    if (!numMatch) continue;

    const rawScoreText = numMatch[1];
    const namePart = cleaned.slice(0, numMatch.index).trim();

    // 3) normalize name
    const parsedName = namePart
      .replace(/\s{2,}/g, " ")
      .replace(/[^\w\s\.\-]/g, "")
      .trim();
    if (parsedName.length < 2) continue;

    // 4) correct score
    const correction = autoCorrect
      ? correctNumericOCR(rawScoreText)
      : {
          value: parseInt(rawScoreText.replace(/,/g, ""), 10),
          corrected: false,
          confidence: 0.9,
          rawText: rawScoreText,
          bigValue: rawScoreText.replace(/[^\d]/g, "") || "0",
        };

    // 5) confidence blending
    let baseConfidence = 0.95;
    if (
      rawScoreText.includes("O") ||
      rawScoreText.includes("S") ||
      rawScoreText.includes("I")
    ) {
      baseConfidence *= 0.85;
    }
    if (parsedName.length < 3) {
      baseConfidence *= 0.8;
    }

    const finalConfidence = baseConfidence * correction.confidence;

    results.push({
      parsedName,
      parsedScore: correction.value,
      rawText: originalLine,
      correctedValue: correction.corrected ? correction.value : null,
      confidence: finalConfidence,
      originalLine,
      bigScore: correction.bigValue, // <- bigint-safe
    });
  }

  return results;
};

/**
 * Get confidence color class
 */
export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.95)
    return "text-green-600 bg-green-50 border-green-200";
  if (confidence >= 0.8)
    return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
};

/**
 * Get confidence badge variant
 */
export const getConfidenceBadgeVariant = (
  confidence: number
): "default" | "secondary" | "destructive" => {
  if (confidence >= 0.95) return "default";
  if (confidence >= 0.8) return "secondary";
  return "destructive";
};
