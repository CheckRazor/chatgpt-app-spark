import { useState, useCallback } from "react";
import { createWorker } from "tesseract.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, ScanText, X, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseScoresFromText, preprocessImage } from "@/lib/ocrProcessing";
import { Badge } from "@/components/ui/badge";

interface FileUploadStatus {
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  extractedText?: string;
  error?: string;
  uploadId?: string;
}

interface MultiFileOCRUploadProps {
  eventId: string;
  onComplete: (scores: any[]) => void;
  canManage: boolean;
}

const MultiFileOCRUpload = ({ eventId, onComplete, canManage }: MultiFileOCRUploadProps) => {
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [strictMode, setStrictMode] = useState(true);

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

      // Preprocess image
      const preprocessedImage = await preprocessImage(fileStatus.file);

      // Create Tesseract worker
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setFiles(prev => prev.map((f, i) => 
              i === index ? { ...f, progress: Math.round(m.progress * 100) } : f
            ));
          }
        },
      });

      // Configure Tesseract for numeric data
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789,. abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        preserve_interword_spaces: '1',
      });

      const { data: { text } } = await worker.recognize(preprocessedImage);
      await worker.terminate();

      // Save to ocr_uploads
      const { data: upload, error: uploadError } = await supabase
        .from('ocr_uploads')
        .insert({
          event_id: eventId,
          original_text: text,
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
          extractedText: text,
          uploadId: upload.id 
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
      if (fileStatus.extractedText && fileStatus.status === 'success') {
        const parsed = parseScoresFromText(
          fileStatus.extractedText, 
          fileStatus.file.name,
          autoCorrect,
          strictMode
        );
        
        parsed.forEach(score => {
          allScores.push({
            ...score,
            imageSource: fileStatus.file.name,
            uploadId: fileStatus.uploadId,
          });
        });
      }
    });

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
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={strictMode}
                  onChange={(e) => setStrictMode(e.target.checked)}
                  className="rounded"
                />
                Strict Name/Score Mode
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoCorrect}
                  onChange={(e) => setAutoCorrect(e.target.checked)}
                  className="rounded"
                />
                Auto-Correct Numeric OCR
              </label>
            </div>
          </div>
          
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
                    
                    <p className="text-xs font-medium truncate mb-2">
                      {fileStatus.file.name}
                    </p>
                    
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
