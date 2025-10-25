import { useState, useCallback } from "react";
import { createWorker } from "tesseract.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface OCRUploadProps {
  eventId: string;
  onComplete: (scores: any[]) => void;
  canManage: boolean;
}

const OCRUpload = ({ eventId, onComplete, canManage }: OCRUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedText, setExtractedText] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const parseScoresFromText = (text: string) => {
    const lines = text.split("\n").filter(line => line.trim());
    const scores: any[] = [];

    lines.forEach(line => {
      const scoreMatch = line.match(/(\d+)/g);
      const nameMatch = line.match(/[a-zA-Z]+/g);
      
      if (scoreMatch && nameMatch) {
        scores.push({
          name: nameMatch.join(" "),
          score: parseInt(scoreMatch[scoreMatch.length - 1]),
          originalLine: line,
        });
      }
    });

    return scores;
  };

  const processImage = useCallback(async () => {
    if (!file || !canManage) return;

    setProcessing(true);
    setProgress(0);

    try {
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      setExtractedText(text);
      
      const parsedScores = parseScoresFromText(text);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      await supabase.from("ocr_uploads").insert([{
        event_id: eventId,
        original_text: text,
        processed_data: parsedScores,
        status: "completed",
        uploaded_by: user.id,
      }]);

      toast.success(`Extracted ${parsedScores.length} potential score entries`);
      onComplete(parsedScores);
    } catch (error: any) {
      toast.error("OCR processing failed: " + error.message);
    } finally {
      setProcessing(false);
    }
  }, [file, eventId, onComplete, canManage]);

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
          <div>
            <label htmlFor="file-upload" className="block text-sm font-medium mb-2">
              Upload Score Sheet Image
            </label>
            <Input
              id="file-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={processing}
            />
          </div>

          {preview && (
            <div className="mt-4">
              <img
                src={preview}
                alt="Preview"
                className="max-h-64 mx-auto border rounded"
              />
            </div>
          )}

          {file && !processing && (
            <Button onClick={processImage} className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              Process Image with OCR
            </Button>
          )}

          {processing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">
                Processing... {progress}%
              </p>
            </div>
          )}

          {extractedText && (
            <Card className="p-4 bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" />
                <h3 className="font-medium">Extracted Text</h3>
              </div>
              <pre className="text-xs whitespace-pre-wrap">{extractedText}</pre>
            </Card>
          )}
        </div>
      </Card>
    </div>
  );
};

export default OCRUpload;
