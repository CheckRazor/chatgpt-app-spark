// src/components/scores/MultiFileOCRUpload.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { runAvalonLeaderboardOCR } from "@/lib/ocrTwoPass";

export interface MultiFileOCRUploadProps {
  eventId?: string;
  canManage: boolean;
  onProcessed?: (rows: any[]) => void;
}

const MultiFileOCRUpload = ({
  eventId,
  canManage,
  onProcessed,
}: MultiFileOCRUploadProps) => {
  // keep file list typed
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    setFiles((prev) => [...prev, ...picked]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleClear = () => {
    setFiles([]);
  };

  const handleProcess = async () => {
    if (!files.length) {
      toast.error("Please select at least one image");
      return;
    }

    setProcessing(true);
    try {
      const allRows: any[] = [];

      for (const file of files) {
        const rowsFromThisFile = await runAvalonLeaderboardOCR(file);

        const stamped = rowsFromThisFile.map((r: any, idx: number) => ({
          ...r,
          uploadId: `${file.name}:${idx}`,
          imageSource: file.name,
          parsedName: r.parsedName ?? "",
          parsedScore: typeof r.parsedScore === "number" ? r.parsedScore : 0,
        }));

        allRows.push(...stamped);
      }

      toast.success(
        `Processed ${allRows.length} rows from ${files.length} file(s).`
      );

      onProcessed?.(allRows);
    } catch (err: any) {
      console.error(err);
      toast.error("OCR failed: " + (err?.message || "unknown error"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer bg-muted/30"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          id="ocr-upload-input"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <label htmlFor="ocr-upload-input" className="cursor-pointer">
          <p className="font-medium">
            Click to upload leaderboard screenshots (you can pick multiple)
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Drag & drop is also supported
          </p>
        </label>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {files.map((f) => (
            <div
              key={f.name + f.size}
              className="px-3 py-1 bg-muted rounded-md text-sm flex items-center gap-2"
            >
              <span className="truncate max-w-[140px]">{f.name}</span>
              <span className="text-xs text-muted-foreground">
                {(f.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Clear
          </Button>
        </div>
      )}

      <Button onClick={handleProcess} disabled={processing || !canManage}>
        {processing ? "Processing..." : "Process OCR"}
      </Button>
    </div>
  );
};

export default MultiFileOCRUpload;
