/**
 * OCR Pre-processing and Accuracy Tuning Utilities
 */

export interface OCRResult {
  parsedName: string;
  parsedScore: number;
  rawText: string;
  correctedValue: number | null;
  confidence: number;
  originalLine: string;
}

/**
 * Preprocess image for better OCR accuracy
 */
export const preprocessImage = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Grayscale and threshold
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const threshold = avg > 128 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = threshold;
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL());
    };
    
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

/**
 * Auto-correct common OCR mistakes in numeric values
 */
export const correctNumericOCR = (text: string): { value: number; corrected: boolean; confidence: number } => {
  let corrected = false;
  let workingText = text.trim();
  
  // Replace common character mistakes
  workingText = workingText.replace(/O/g, '0'); // O -> 0
  workingText = workingText.replace(/S/g, '5'); // S -> 5
  workingText = workingText.replace(/I/g, '1'); // I -> 1
  workingText = workingText.replace(/l/g, '1'); // l -> 1
  
  if (workingText !== text.trim()) corrected = true;
  
  // Remove spaces and normalize commas
  workingText = workingText.replace(/\s/g, '');
  
  // Fix malformed comma patterns (e.g., "2,5,00" -> "25,000")
  const malformedComma = /(\d),(\d),(\d{2,})/.exec(workingText);
  if (malformedComma) {
    workingText = workingText.replace(/,/g, '');
    workingText = workingText.slice(0, -3) + ',' + workingText.slice(-3);
    corrected = true;
  }
  
  // Auto-append missing zeros based on comma placement
  // e.g., "15,4" -> "15,400"
  const commaPattern = /(\d+),(\d{1,2})$/.exec(workingText);
  if (commaPattern) {
    const afterComma = commaPattern[2];
    if (afterComma.length === 1) {
      workingText = workingText + '00';
      corrected = true;
    } else if (afterComma.length === 2) {
      workingText = workingText + '0';
      corrected = true;
    }
  }
  
  // Remove commas for final parsing
  const numericValue = parseInt(workingText.replace(/,/g, ''), 10);
  
  // Calculate confidence based on corrections made
  let confidence = 1.0;
  if (corrected) {
    confidence = 0.85; // Lower confidence if corrections were made
  }
  
  // Additional confidence adjustment based on value reasonableness
  if (numericValue < 100) confidence *= 0.7; // Very low scores are suspect
  if (numericValue > 1000000) confidence *= 0.6; // Very high scores are suspect
  
  return {
    value: isNaN(numericValue) ? 0 : numericValue,
    corrected,
    confidence: Math.max(0, Math.min(1, confidence))
  };
};

/**
 * Parse OCR text into structured score entries
 */
export const parseScoresFromText = (text: string, fileName: string, autoCorrect: boolean = true): OCRResult[] => {
  const lines = text.split('\n').filter(line => line.trim());
  const scores: OCRResult[] = [];
  
  lines.forEach((line, index) => {
    // Look for score patterns (numbers with optional commas)
    const scorePattern = /[\d,]+/g;
    const scoreMatches = line.match(scorePattern);
    
    // Look for names (consecutive letters, may include spaces)
    const namePattern = /[a-zA-Z\s]+/g;
    const nameMatches = line.match(namePattern);
    
    if (scoreMatches && nameMatches) {
      // Take last number as score (usually rightmost)
      const rawScore = scoreMatches[scoreMatches.length - 1];
      const correction = autoCorrect ? correctNumericOCR(rawScore) : { value: parseInt(rawScore.replace(/,/g, ''), 10), corrected: false, confidence: 0.9 };
      
      // Take first name match
      const name = nameMatches[0].trim();
      
      // Calculate base confidence from Tesseract (simulated based on patterns)
      let baseConfidence = 0.95;
      if (line.includes('?') || line.includes('~')) baseConfidence = 0.5;
      if (name.length < 2) baseConfidence *= 0.6;
      
      // Combine confidences
      const finalConfidence = baseConfidence * correction.confidence;
      
      scores.push({
        parsedName: name,
        parsedScore: correction.value,
        rawText: line.trim(),
        correctedValue: correction.corrected ? correction.value : null,
        confidence: finalConfidence,
        originalLine: line,
      });
    }
  });
  
  return scores;
};

/**
 * Get confidence color class
 */
export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.95) return 'text-green-600 bg-green-50 border-green-200';
  if (confidence >= 0.8) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
};

/**
 * Get confidence badge variant
 */
export const getConfidenceBadgeVariant = (confidence: number): "default" | "secondary" | "destructive" => {
  if (confidence >= 0.95) return 'default';
  if (confidence >= 0.8) return 'secondary';
  return 'destructive';
};
