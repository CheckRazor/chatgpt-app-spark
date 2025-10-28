import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, X, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { getConfidenceColor, getConfidenceBadgeVariant } from "@/lib/ocrProcessing";
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
}

interface EnhancedScoreReviewProps {
  eventId: string;
  parsedScores: any[];
  canManage: boolean;
}

const EnhancedScoreReview = ({ eventId, parsedScores, canManage }: EnhancedScoreReviewProps) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (parsedScores.length > 0) {
      const mapped = parsedScores.map(s => {
        const suggestedPlayer = findMatchingPlayer(s.parsedName);
        return {
          ...s,
          linkedPlayerId: suggestedPlayer?.id,
          isVerified: false,
        };
      });
      setScores(mapped);
      saveToOCRRows(mapped);
    }
  }, [parsedScores]);

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from("players")
      .select("id, canonical_name, aliases, is_alt")
      .is("deleted_at", null)
      .order("canonical_name");

    if (data) setPlayers(data);
  };

  const saveToOCRRows = async (scoreRows: ScoreRow[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const rows = scoreRows.map(s => ({
      event_id: eventId,
      upload_id: s.uploadId,
      parsed_name: s.parsedName,
      parsed_score: s.parsedScore,
      raw_text: s.rawText,
      corrected_value: s.correctedValue,
      confidence: s.confidence,
      linked_player_id: s.linkedPlayerId,
      is_verified: s.isVerified,
      image_source: s.imageSource,
    }));

    await supabase.from('ocr_rows').insert(rows);
  };

  const findMatchingPlayer = (name: string) => {
    const normalized = name.toLowerCase().trim();
    return players.find(
      (p) =>
        p.canonical_name.toLowerCase() === normalized ||
        p.aliases?.some((a) => a.toLowerCase() === normalized)
    );
  };

  const handlePlayerSelect = (index: number, playerId: string) => {
    setScores(prev => prev.map((s, i) => 
      i === index ? { ...s, linkedPlayerId: playerId } : s
    ));
  };

  const handleScoreChange = (index: number, value: string) => {
    setScores(prev => prev.map((s, i) => 
      i === index ? { ...s, parsedScore: parseInt(value) || 0 } : s
    ));
  };

  const handleVerify = (index: number) => {
    setScores(prev => prev.map((s, i) => 
      i === index ? { ...s, isVerified: !s.isVerified } : s
    ));
  };

  const bulkApproveHighConfidence = () => {
    setScores(prev => prev.map(s => 
      s.confidence >= 0.95 && s.linkedPlayerId ? { ...s, isVerified: true } : s
    ));
    toast.success("✅ High confidence scores approved");
  };

  const handleCommitScores = async () => {
    if (!canManage) return;

    const verifiedScores = scores.filter(s => s.isVerified && s.linkedPlayerId);
    if (verifiedScores.length === 0) {
      toast.error("⚠️ No verified scores to commit");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Group by player, keep highest score
      const playerScores = new Map<string, number>();
      verifiedScores.forEach(s => {
        const current = playerScores.get(s.linkedPlayerId!) || 0;
        playerScores.set(s.linkedPlayerId!, Math.max(current, s.parsedScore));
      });

      // Create batch operation
      const { data: batchOp, error: batchError } = await supabase
        .from('batch_operations')
        .insert({
          operation_type: 'ocr_import',
          event_id: eventId,
          created_by: user.id,
          metadata: { score_count: playerScores.size },
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Upsert scores
      const scoreData = Array.from(playerScores.entries()).map(([playerId, score]) => ({
        event_id: eventId,
        player_id: playerId,
        score,
        raw_score: score,
        verified: true,
        created_by: user.id,
      }));

      const { error: scoresError } = await supabase.from('scores').upsert(scoreData, {
        onConflict: 'event_id,player_id',
      });

      if (scoresError) throw scoresError;

      const skipped = verifiedScores.length - playerScores.size;
      toast.success(`✅ ${playerScores.size} scores committed.${skipped > 0 ? ` ⚠️ ${skipped} duplicates merged.` : ''}`);
      
      setScores([]);
      setShowCommitDialog(false);
    } catch (error: any) {
      toast.error("Failed to commit scores: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredScores = searchTerm
    ? scores.filter(s => 
        s.parsedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.confidence.toString().includes(searchTerm)
      )
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

  const verifiedCount = scores.filter(s => s.isVerified).length;
  const highConfidenceCount = scores.filter(s => s.confidence >= 0.95 && s.linkedPlayerId && !s.isVerified).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or confidence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {highConfidenceCount > 0 && (
          <Button variant="outline" onClick={bulkApproveHighConfidence}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Bulk Approve High Confidence ({highConfidenceCount})
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
              <TableRow 
                key={index} 
                className={`${score.isVerified ? 'bg-muted/50' : ''} ${getConfidenceColor(score.confidence)} border-l-4`}
              >
                <TableCell className="font-medium">{score.parsedName}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={score.parsedScore}
                    onChange={(e) => handleScoreChange(index, e.target.value)}
                    className="w-28"
                  />
                  {score.correctedValue && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      Auto-corrected
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={getConfidenceBadgeVariant(score.confidence)}>
                    {(score.confidence * 100).toFixed(0)}%
                  </Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={score.linkedPlayerId || ""}
                    onValueChange={(value) => handlePlayerSelect(index, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {players.map((player) => (
                        <SelectItem key={player.id} value={player.id}>
                          {player.canonical_name} {player.is_alt && "(Alt)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {score.imageSource}
                </TableCell>
                <TableCell className="text-right">
                  {score.isVerified ? (
                    <Badge variant="default">Verified</Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
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
          disabled={verifiedCount === 0 || loading}
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
              Commit {verifiedCount} verified scores for this event? This will overwrite existing scores for these players and cannot be undone.
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
