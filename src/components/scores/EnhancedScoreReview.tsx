import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  X,
  Search,
  AlertTriangle,
  Trash2,
  GitMerge,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  getConfidenceColor,
  getConfidenceBadgeVariant,
} from "@/lib/ocrProcessing";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Player {
  id: string;
  canonical_name: string;
  aliases: string[];
  is_alt: boolean;
  main_player_id?: string | null;
}

interface ScoreRow {
  id?: string;
  parsedName: string;
  parsedScore: number;
  rawText: string;
  correctedValue: number | null;
  confidence: number;
  imageSource: string;
  uploadId?: string;
  linkedPlayerId?: string;
  isVerified: boolean;
  scoreError?: string;
  bigScore?: string; // bigint-safe digits string from OCR
  metadata?: {
    nameConfidence?: number;
    scoreConfidence?: number;
    rawScoreText?: string;
    nameCanvas?: HTMLCanvasElement;
    scoreCanvas?: HTMLCanvasElement;
    originalWidth?: number;
    originalHeight?: number;
    processedWidth?: number;
    processedHeight?: number;
    scaleFactor?: number;
  };
}

interface EnhancedScoreReviewProps {
  eventId: string;
  parsedScores: any[];
  canManage: boolean;
}

const EnhancedScoreReview = ({
  eventId,
  parsedScores,
  canManage,
}: EnhancedScoreReviewProps) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (parsedScores && parsedScores.length > 0) {
      const mapped: ScoreRow[] = parsedScores.map((s: any) => {
        const suggestedPlayer = findMatchingPlayer(s.parsedName);
        return {
          ...s,
          parsedName: s.parsedName ?? s.name ?? "",
          parsedScore:
            typeof s.parsedScore === "number"
              ? s.parsedScore
              : parseInt(s.bigScore || "0", 10) || 0,
          bigScore:
            s.bigScore ||
            s.parsedScore?.toString()?.replace(/[^\d]/g, "") ||
            "0",
          linkedPlayerId: suggestedPlayer?.id,
          isVerified: false,
        };
      });
      setScores(mapped);
      // fire and forget
      saveToOCRRows(mapped);
    }
  }, [parsedScores]);

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from("players")
      .select("id, canonical_name, aliases, is_alt, main_player_id")
      .is("deleted_at", null)
      .order("canonical_name");

    if (data) setPlayers(data);
  };

  // save raw OCR rows for audit/debug
  const saveToOCRRows = async (scoreRows: ScoreRow[]) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const rows = scoreRows.map((s) => {
      const digitsOnly =
        s.bigScore ||
        s.parsedScore.toString().replace(/[^\d]/g, "") ||
        "0";

      return {
        event_id: eventId,
        upload_id: s.uploadId ?? null,
        parsed_name: s.parsedName ?? "",
        parsed_score: s.parsedScore ?? 0,
        // our DB type may be numeric/bigint, but we want to keep
        // the string version — so we cast through any on insert
        parsed_score_big: digitsOnly,
        raw_text: s.rawText ?? "",
        raw_score_text: s.bigScore
          ? s.bigScore.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
          : (s.parsedScore ?? 0).toLocaleString(),
        corrected_value: s.correctedValue,
        confidence: s.confidence ?? 0,
        linked_player_id: s.linkedPlayerId ?? null,
        is_verified: s.isVerified ?? false,
        image_source: s.imageSource ?? "",
        created_by: user.id,
      };
    });

    // 👇 TS fix: our supabase types think parsed_score_big is numeric
    // but we're providing a string for bigint-safety. Cast to any.
    const { error } = await supabase.from("ocr_rows").insert(rows as any);
    if (error) {
      console.warn("Failed to save ocr_rows:", error.message);
    }
  };

  const findMatchingPlayer = (name: string) => {
    if (!name) return null;
    const normalized = name.toLowerCase().trim();
    return players.find(
      (p) =>
        p.canonical_name.toLowerCase() === normalized ||
        p.aliases?.some((a) => a.toLowerCase() === normalized)
    );
  };

  const handlePlayerSelect = (index: number, playerId: string) => {
    setScores((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, linkedPlayerId: playerId } : s
      )
    );
  };

  const handleNameChange = (index: number, value: string) => {
    setScores((prev) =>
      prev.map((s, i) => (i === index ? { ...s, parsedName: value } : s))
    );
  };

  const handleScoreChange = (index: number, value: string) => {
    const isValid =
      /^\d{1,3}(,\d{3})*$/.test(value.trim()) || value.trim() === "";

    const numericValue = value.replace(/,/g, "");
    const parsedNum = parseInt(numericValue) || 0;

    setScores((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              parsedScore: parsedNum,
              bigScore: numericValue || "0",
              scoreError:
                !isValid && value.trim()
                  ? "Invalid number format"
                  : undefined,
            }
          : s
      )
    );
  };

  const handleVerify = (index: number) => {
    setScores((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, isVerified: !s.isVerified } : s
      )
    );
  };

  const bulkApproveHighConfidence = () => {
    setScores((prev) =>
      prev.map((s) =>
        s.confidence >= 0.95 && s.linkedPlayerId
          ? { ...s, isVerified: true }
          : s
      )
    );
    toast.success("✅ High confidence scores approved");
  };

  const handleDeleteRow = (index: number) => {
    setScores((prev) => prev.filter((_, i) => i !== index));
    toast.success("Row deleted");
  };

  const handleAddRow = () => {
    const newRow: ScoreRow = {
      parsedName: "",
      parsedScore: 0,
      bigScore: "0",
      rawText: "Manual entry",
      correctedValue: null,
      confidence: 1.0,
      imageSource: "Manual",
      isVerified: false,
    };
    setScores((prev) => [...prev, newRow]);
  };

  const handleMergeDuplicates = () => {
    const playerMap = new Map<string, ScoreRow>();

    scores.forEach((score) => {
      if (!score.linkedPlayerId) return;

      const existing = playerMap.get(score.linkedPlayerId);
      const currentBig = BigInt(score.bigScore || "0");

      if (!existing) {
        playerMap.set(score.linkedPlayerId, score);
      } else {
        const existingBig = BigInt(existing.bigScore || "0");
        if (currentBig > existingBig) {
          playerMap.set(score.linkedPlayerId, score);
        }
      }
    });

    const uniqueScores = Array.from(playerMap.values());
    const removedCount = scores.length - uniqueScores.length;

    setScores(uniqueScores);
    toast.success(
      `🔀 ${removedCount} duplicates merged, kept highest scores (by bigint)`
    );
  };

  const handleCommitScores = async () => {
    if (!canManage) return;

    const verifiedScores = scores.filter(
      (s) => s.isVerified && s.linkedPlayerId
    );
    if (verifiedScores.length === 0) {
      toast.error("⚠️ No verified scores to commit");
      return;
    }

    const hasErrors = scores.some((s) => s.scoreError);
    if (hasErrors) {
      toast.error("⚠️ Fix invalid scores before committing");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: allPlayers, error: playersError } = await supabase
        .from("players")
        .select("id, is_alt, main_player_id")
        .is("deleted_at", null);

      if (playersError) throw playersError;

      const playerMap = new Map<string, Player>(
        (allPlayers || []).map((p: any) => [p.id, p])
      );

      const playerScores = new Map<string, string>();
      let skippedCount = 0;

      verifiedScores.forEach((s) => {
        if (!s.linkedPlayerId) {
          skippedCount++;
          return;
        }

        const player = playerMap.get(s.linkedPlayerId);
        if (!player) {
          skippedCount++;
          return;
        }

        const finalPlayerId =
          player.is_alt && player.main_player_id
            ? player.main_player_id
            : s.linkedPlayerId;

        const digitsOnly =
          s.bigScore ||
          s.parsedScore.toString().replace(/[^\d]/g, "") ||
          "0";
        const currentBig = BigInt(digitsOnly);
        const existingBig = BigInt(playerScores.get(finalPlayerId) || "0");

        if (currentBig > existingBig) {
          playerScores.set(finalPlayerId, digitsOnly);
        }
      });

      if (playerScores.size === 0) {
        toast.error("⚠️ No valid scores to commit after validation");
        setLoading(false);
        return;
      }

      const { data: batchOp, error: batchError } = await supabase
        .from("batch_operations")
        .insert({
          operation_type: "ocr_import",
          event_id: eventId,
          created_by: user.id,
          metadata: { score_count: playerScores.size },
        })
        .select()
        .single();

      if (batchError) throw batchError;

      const scoreData = Array.from(playerScores.entries()).map(
        ([playerId, scoreBig]) => ({
          event_id: eventId,
          player_id: playerId,
          score: scoreBig, // string → DB casts
          raw_score: scoreBig,
          verified: true,
          created_by: user.id,
        })
      );

      // 👇 same trick: our generated types may say "number", but we want string
      const { error: scoresError } = await supabase
        .from("scores")
        .upsert(scoreData as any, {
          onConflict: "event_id,player_id",
        });

      if (scoresError) {
        toast.error(`Database error: ${scoresError.message}`);
        throw scoresError;
      }

      toast.success(
        `✅ Committed ${playerScores.size} players.${
          skippedCount > 0 ? ` ⚠️ Skipped ${skippedCount} invalid rows.` : ""
        }`
      );

      setScores([]);
      setShowCommitDialog(false);
    } catch (error: any) {
      toast.error("Failed to commit scores: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredScores = searchTerm
    ? scores.filter((s) => {
        const name = s.parsedName || "";
        return (
          name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.confidence.toString().includes(searchTerm)
        );
      })
    : scores;

  if (!canManage) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        You don't have permission to review scores
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No scores to review. Upload score sheets first.
      </div>
    );
  }

  const verifiedCount = scores.filter((s) => s.isVerified).length;
  const highConfidenceCount = scores.filter(
    (s) => s.confidence >= 0.95 && s.linkedPlayerId && !s.isVerified
  ).length;
  const hasErrors = scores.some((s) => s.scoreError);
  const allVerifiedAndLinked = scores.every(
    (s) => s.isVerified && s.linkedPlayerId
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or confidence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button variant="outline" size="sm" onClick={handleAddRow}>
          <Plus className="mr-2 h-4 w-4" />
          Add Row
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleMergeDuplicates}
          disabled={scores.filter((s) => s.linkedPlayerId).length < 2}
        >
          <GitMerge className="mr-2 h-4 w-4" />
          Merge Duplicates
        </Button>

        {highConfidenceCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={bulkApproveHighConfidence}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Bulk Approve ≥95% ({highConfidenceCount})
          </Button>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parsed Name</TableHead>
              <TableHead>Parsed Score</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Linked Player</TableHead>
              <TableHead>Image Source</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredScores.map((score, index) => (
              <>
                <TableRow
                  key={index}
                  className={`${score.isVerified ? "bg-muted/50" : ""} ${getConfidenceColor(
                    score.confidence
                  )} border-l-4`}
                >
                  <TableCell className="font-medium">
                    <Input
                      type="text"
                      value={score.parsedName}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                      className="w-full"
                      placeholder="Player name"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Input
                        type="text"
                        value={
                          score.bigScore
                            ? score.bigScore.replace(
                                /\B(?=(\d{3})+(?!\d))/g,
                                ","
                              )
                            : score.parsedScore.toLocaleString()
                        }
                        onChange={(e) =>
                          handleScoreChange(index, e.target.value)
                        }
                        className={`w-32 ${
                          score.scoreError ? "border-red-500" : ""
                        }`}
                        placeholder="0"
                      />
                      {score.scoreError && (
                        <p className="text-xs text-red-500">
                          {score.scoreError}
                        </p>
                      )}
                      {score.correctedValue && (
                        <Badge variant="outline" className="text-xs">
                          Auto-corrected
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge
                        variant={getConfidenceBadgeVariant(score.confidence)}
                      >
                        {(score.confidence * 100).toFixed(0)}%
                      </Badge>
                      {score.metadata && (
                        <div className="text-xs text-muted-foreground">
                          <div>
                            Name:{" "}
                            {(
                              (score.metadata.nameConfidence || 0) * 100
                            ).toFixed(0)}
                            %
                          </div>
                          <div>
                            Score:{" "}
                            {(
                              (score.metadata.scoreConfidence || 0) * 100
                            ).toFixed(0)}
                            %
                          </div>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={score.linkedPlayerId || ""}
                      onValueChange={(value) =>
                        handlePlayerSelect(index, value)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select player" />
                      </SelectTrigger>
                      <SelectContent>
                        {players.map((player) => (
                          <SelectItem key={player.id} value={player.id}>
                            {player.canonical_name}{" "}
                            {player.is_alt && "(Alt)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>{score.imageSource}</div>
                    {score.metadata && (
                      <div className="mt-1">
                        {score.metadata.originalWidth}×
                        {score.metadata.originalHeight}px{" "}
                        (scale {score.metadata.scaleFactor?.toFixed(2)}×)
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {score.isVerified ? (
                      <Badge variant="default">Verified</Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {score.metadata?.nameCanvas && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedRow(
                              expandedRow === index ? null : index
                            )
                          }
                        >
                          {expandedRow === index ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant={score.isVerified ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleVerify(index)}
                        disabled={!score.linkedPlayerId}
                      >
                        {score.isVerified ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRow(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {expandedRow === index && score.metadata?.nameCanvas && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/30">
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium mb-2">
                              Name Region
                            </div>
                            <img
                              src={score.metadata.nameCanvas.toDataURL()}
                              alt="Name OCR region"
                              className="border rounded"
                            />
                            <div className="text-xs text-muted-foreground mt-1">
                              Confidence:{" "}
                              {(
                                (score.metadata.nameConfidence || 0) * 100
                              ).toFixed(1)}
                              %
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium mb-2">
                              Score Region
                            </div>
                            <img
                              src={score.metadata.scoreCanvas!.toDataURL()}
                              alt="Score OCR region"
                              className="border rounded"
                            />
                            <div className="text-xs text-muted-foreground mt-1">
                              Confidence:{" "}
                              {(
                                (score.metadata.scoreConfidence || 0) * 100
                              ).toFixed(1)}
                              %
                              {score.metadata.rawScoreText && (
                                <> • Raw: {score.metadata.rawScoreText}</>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <div>
                            Original: {score.metadata.originalWidth}×
                            {score.metadata.originalHeight}px
                          </div>
                          <div>
                            Processed: {score.metadata.processedWidth}×
                            {score.metadata.processedHeight}px
                          </div>
                          <div>
                            Scale: {score.metadata.scaleFactor?.toFixed(2)}×
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {verifiedCount} of {scores.length} scores verified
        </div>
        <Button
          onClick={() => setShowCommitDialog(true)}
          disabled={
            verifiedCount === 0 ||
            loading ||
            hasErrors ||
            !allVerifiedAndLinked
          }
          size="lg"
        >
          <CheckCircle className="mr-2 h-4 w-4" />
          Commit {verifiedCount} Verified Scores
        </Button>
      </div>

      <AlertDialog open={showCommitDialog} onOpenChange={setShowCommitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Commit Verified Scores?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Commit {verifiedCount} verified scores for this event? This will
              overwrite existing scores for these players and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCommitScores} disabled={loading}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Commit Scores
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EnhancedScoreReview;
