import { useState } from "react";
import MultiFileOCRUpload from "./MultiFileOCRUpload";
import EnhancedScoreReview from "./EnhancedScoreReview";
import { Button } from "@/components/ui/button";

interface ScoreManagerProps {
  eventId?: string;
  canManage?: boolean;
}

const ScoreManager = ({
  eventId = "",
  canManage = true,
}: ScoreManagerProps) => {
  // holds all OCR rows coming back from uploads
  const [parsedScores, setParsedScores] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"upload" | "review">("upload");

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Event Scores</h1>
          <p className="text-sm text-muted-foreground">
            Upload leaderboard screenshots and review extracted scores.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            setActiveTab((prev) => (prev === "upload" ? "review" : "upload"))
          }
        >
          {activeTab === "upload" ? "Go to Review" : "Go to Upload"}
        </Button>
      </div>

      {/* tabs */}
      <div className="flex rounded-md border overflow-hidden">
        <button
          onClick={() => setActiveTab("upload")}
          className={`flex-1 py-2 text-center text-sm font-medium ${
            activeTab === "upload"
              ? "bg-muted text-foreground"
              : "bg-background text-muted-foreground"
          }`}
        >
          Upload &amp; Scan
        </button>
        <button
          onClick={() => setActiveTab("review")}
          className={`flex-1 py-2 text-center text-sm font-medium ${
            activeTab === "review"
              ? "bg-muted text-foreground"
              : "bg-background text-muted-foreground"
          }`}
        >
          Review &amp; Import
        </button>
      </div>

      {activeTab === "upload" ? (
        <div className="rounded-lg border bg-background p-4">
          <MultiFileOCRUpload
            canManage={canManage} // ✅ added to fix TS error
            onProcessed={(rowsFromAllFiles) => {
              // append to existing rows so multiple uploads show together
              setParsedScores((prev) => [...prev, ...rowsFromAllFiles]);
              // setActiveTab("review"); // optional auto-switch
            }}
          />
        </div>
      ) : (
        <div className="rounded-lg border bg-background p-4">
          <EnhancedScoreReview
            eventId={eventId}
            parsedScores={parsedScores}
            canManage={canManage}
          />
        </div>
      )}
    </div>
  );
};

export default ScoreManager;
