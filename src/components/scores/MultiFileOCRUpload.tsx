import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, ScanText, X, CheckCircle, AlertCircle, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { correctNumericOCR } from "@/lib/ocrProcessing";
import { Badge } from "@/components/ui/badge";
import { preprocessImageFile } from "@/lib/ocrPreprocess";
import { processTwoPassOCR, terminateSharedWorker, TwoPassResult } from "@/lib/ocrTwoPass";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FileUploadStatus {
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  extractedRows?: TwoPassResult[];
  error?: string;
  uploadId?: string;
  metadata?: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
    scaleFactor: number;
  };
}

interface MultiFileOCRUploadProps {
  eventId: string;
  onComplete: (scores: any[]) => void;
  canManage: boolean;
}

const MultiFileOCRUpload = ({ eventId, onComplete, canManage }: MultiFileOCRUploadProps) => {
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [scaleOverride, setScaleOverride] = useState<number | undefined>(undefined);
  const [splitRatio, setSplitRatio] = useState(0.70);
  const [aggressiveThreshold, setAggressiveThreshold] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ocr-settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (settings.scaleOverride) setScaleOverride(settings.scaleOverride);
        if (settings.splitRatio) setSplitRatio(settings.splitRatio);
        if (settings.aggressiveThreshold !== undefined) setAggressiveThreshold(settings.aggressiveThreshold);
      } catch (e) {
        console.error('Failed to load OCR settings', e);
      }
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('ocr-settings', JSON.stringify({
      scaleOverride,
      splitRatio,
      aggressiveThreshold,
    }));
  }, [scaleOverride, splitRatio, aggressiveThreshold]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      terminateSharedWorker();
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    if (selectedFiles.length === 0) return;

    const validFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
    
    if (validFiles.length !== selectedFiles.length) {
      toast.error("Some files were not images and were skipped");
    }

    const newFileStatuses: FileUploadStatus[] = validFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...newFileStatuses]);
  };

  const processFile = async (index: number) => {
    const fileStatus = files[index];
    
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, status: 'processing', progress: 0 } : f
    ));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Preprocess image at original resolution
      const preprocessed = await preprocessImageFile(
        fileStatus.file,
        scaleOverride,
        aggressiveThreshold
      );

      // Two-pass OCR with row segmentation
      const rows = await processTwoPassOCR(
        preprocessed.canvas,
        splitRatio,
        (current, total) => {
          const progress = Math.round((current / total) * 100);
          setFiles(prev => prev.map((f, i) => 
            i === index ? { ...f, progress } : f
          ));
        }
      );

      if (rows.length === 0) {
        toast.error(`OCR returned no rows for ${fileStatus.file.name} — try adjusting zoom or re-upload`);
        throw new Error('No rows detected');
      }

      // Format results for upload
      const formattedText = rows.map(r => `${r.name} ${r.score}`).join('\n');

      // Save to ocr_uploads
      const { data: upload, error: uploadError } = await supabase
        .from('ocr_uploads')
        .insert({
          event_id: eventId,
          original_text: formattedText,
          status: 'completed',
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (uploadError) throw uploadError;

      setFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          status: 'success', 
          progress: 100, 
          extractedRows: rows,
          uploadId: upload.id,
          metadata: {
            originalWidth: preprocessed.originalWidth,
            originalHeight: preprocessed.originalHeight,
            processedWidth: preprocessed.processedWidth,
            processedHeight: preprocessed.processedHeight,
            scaleFactor: preprocessed.scaleFactor,
          }
        } : f
      ));

    } catch (error: any) {
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: 'error', error: error.message } : f
      ));
      toast.error(`Failed to process ${fileStatus.file.name}`);
    }
  };

  const processAllFiles = async () => {
    const pendingIndices = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.status === 'pending' || f.status === 'error')
      .map(({ i }) => i);

    for (const index of pendingIndices) {
      await processFile(index);
    }
  };

  const mergeAndReview = () => {
    const allScores: any[] = [];
    
    files.forEach(fileStatus => {
      if (fileStatus.extractedRows && fileStatus.status === 'success') {
        fileStatus.extractedRows.forEach(row => {
          // Apply numeric correction
          const scoreCorrection = autoCorrect 
            ? correctNumericOCR(row.score)
            : { value: parseInt(row.score.replace(/,/g, ''), 10) || 0, corrected: false, confidence: 0.9, rawText: row.score };

          // Calculate overall confidence
          const overallConfidence = (row.nameConfidence + row.scoreConfidence) / 2 * scoreCorrection.confidence;

          allScores.push({
            parsedName: row.name,
            parsedScore: scoreCorrection.value,
            rawText: `${row.name} ${row.score}`,
            correctedValue: scoreCorrection.corrected ? scoreCorrection.value : null,
            confidence: overallConfidence,
            originalLine: `${row.name} ${row.score}`,
            imageSource: fileStatus.file.name,
            uploadId: fileStatus.uploadId,
            metadata: {
              nameConfidence: row.nameConfidence,
              scoreConfidence: row.scoreConfidence,
              rawScoreText: scoreCorrection.rawText,
              nameCanvas: row.nameCanvas,
              scoreCanvas: row.scoreCanvas,
              ...fileStatus.metadata,
            }
          });
        });
      }
    });

    if (allScores.length === 0) {
      toast.error("No scores extracted");
      return;
    }

    toast.success(`✅ ${allScores.length} scores extracted from ${files.filter(f => f.status === 'success').length} files`);
    onComplete(allScores);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  if (!canManage) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        You don't have permission to upload scores
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="multi-file-upload" className="text-sm font-medium">
              Upload Score Sheet Images (Multiple)
            </label>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoCorrect}
                  onChange={(e) => setAutoCorrect(e.target.checked)}
                  className="rounded"
                />
                Auto-Correct Numeric OCR
              </label>
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Advanced
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
          </div>

          <Collapsible open={showAdvanced}>
            <CollapsibleContent className="space-y-4 border rounded-lg p-4 bg-muted/50">
              <div className="space-y-2">
                <Label className="text-sm">Scale Override: {scaleOverride ? `${scaleOverride.toFixed(1)}×` : 'Auto'}</Label>
                <Slider
                  value={[scaleOverride || 1.0]}
                  onValueChange={([v]) => setScaleOverride(v === 1.0 ? undefined : v)}
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">Name/Score Split: {(splitRatio * 100).toFixed(0)}%</Label>
                <Slider
                  value={[splitRatio]}
                  onValueChange={([v]) => setSplitRatio(v)}
                  min={0.6}
                  max={0.8}
                  step={0.05}
                  className="w-full"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={aggressiveThreshold}
                  onChange={(e) => setAggressiveThreshold(e.target.checked)}
                  className="rounded"
                />
                Aggressive Threshold (for low contrast)
              </label>
            </CollapsibleContent>
          </Collapsible>
          
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <input
              id="multi-file-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <label htmlFor="multi-file-upload" className="cursor-pointer">
              <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, WEBP (Multiple files supported)
              </p>
            </label>
          </div>

          {files.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {files.map((fileStatus, index) => (
                  <Card key={index} className="p-4 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    
                    <img
                      src={fileStatus.preview}
                      alt={fileStatus.file.name}
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                    
                    <p className="text-xs font-medium truncate mb-1">
                      {fileStatus.file.name}
                    </p>
                    
                    {fileStatus.metadata && (
                      <p className="text-xs text-muted-foreground">
                        {fileStatus.metadata.originalWidth}×{fileStatus.metadata.originalHeight}px 
                        (scale {fileStatus.metadata.scaleFactor.toFixed(2)}×)
                      </p>
                    )}
                    
                    {fileStatus.status === 'processing' && (
                      <Progress value={fileStatus.progress} className="h-2" />
                    )}
                    
                    <div className="flex items-center gap-2 mt-2">
                      {fileStatus.status === 'pending' && (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                      {fileStatus.status === 'processing' && (
                        <Badge variant="secondary">
                          <ScanText className="h-3 w-3 mr-1" />
                          {fileStatus.progress}%
                        </Badge>
                      )}
                      {fileStatus.status === 'success' && (
                        <Badge variant="default">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Complete
                        </Badge>
                      )}
                      {fileStatus.status === 'error' && (
                        <>
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Error
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => processFile(index)}
                          >
                            <ScanText className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={processAllFiles}
                  disabled={!files.some(f => f.status === 'pending' || f.status === 'error')}
                  className="flex-1"
                >
                  <ScanText className="mr-2 h-4 w-4" />
                  Process All Files
                </Button>
                
                <Button
                  onClick={mergeAndReview}
                  disabled={!files.some(f => f.status === 'success')}
                  variant="default"
                  className="flex-1"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Review & Import ({files.filter(f => f.status === 'success').length} ready)
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

export default MultiFileOCRUpload;
