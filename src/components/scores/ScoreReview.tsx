import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, UserSearch } from "lucide-react";
import { toast } from "sonner";

interface Player {
  id: string;
  canonical_name: string;
  aliases: string[];
}

interface ScoreEntry {
  name: string;
  score: number;
  originalLine: string;
  playerId?: string;
  verified?: boolean;
}

interface ScoreReviewProps {
  eventId: string;
  parsedScores: any[];
  canManage: boolean;
}

const ScoreReview = ({ eventId, parsedScores, canManage }: ScoreReviewProps) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (parsedScores.length > 0) {
      setScores(parsedScores.map(s => ({ ...s, verified: false })));
    }
  }, [parsedScores]);

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from("players")
      .select("id, canonical_name, aliases")
      .is("deleted_at", null)
      .order("canonical_name");

    if (data) setPlayers(data);
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
    const newScores = [...scores];
    newScores[index].playerId = playerId;
    setScores(newScores);
  };

  const handleScoreChange = (index: number, value: string) => {
    const newScores = [...scores];
    newScores[index].score = parseInt(value) || 0;
    setScores(newScores);
  };

  const handleVerify = (index: number) => {
    const newScores = [...scores];
    newScores[index].verified = !newScores[index].verified;
    setScores(newScores);
  };

  const handleImport = async () => {
    if (!canManage) return;

    const verifiedScores = scores.filter((s) => s.verified && s.playerId);

    if (verifiedScores.length === 0) {
      toast.error("No verified scores to import");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const scoreData = verifiedScores.map((s, idx) => ({
        event_id: eventId,
        player_id: s.playerId!,
        score: s.score,
        rank: idx + 1,
        verified: true,
        created_by: user.id,
      }));

      const { error } = await supabase.from("scores").insert(scoreData);

      if (error) throw error;

      toast.success(`Imported ${verifiedScores.length} scores successfully`);
      setScores([]);
    } catch (error: any) {
      toast.error("Failed to import scores: " + error.message);
    } finally {
      setLoading(false);
    }
  };

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
        No scores to review. Upload a score sheet first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Detected Name</TableHead>
            <TableHead>Match to Player</TableHead>
            <TableHead>Score</TableHead>
            <TableHead className="text-right">Verify</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((score, index) => {
            const suggestedPlayer = findMatchingPlayer(score.name);
            
            return (
              <TableRow key={index} className={score.verified ? "bg-muted/50" : ""}>
                <TableCell className="font-medium">{score.name}</TableCell>
                <TableCell>
                  <Select
                    value={score.playerId || (suggestedPlayer?.id || "")}
                    onValueChange={(value) => handlePlayerSelect(index, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select player">
                        {suggestedPlayer && !score.playerId
                          ? `${suggestedPlayer.canonical_name} (suggested)`
                          : players.find((p) => p.id === score.playerId)?.canonical_name || "Select player"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {players.map((player) => (
                        <SelectItem key={player.id} value={player.id}>
                          {player.canonical_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={score.score}
                    onChange={(e) => handleScoreChange(index, e.target.value)}
                    className="w-24"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={score.verified ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleVerify(index)}
                    disabled={!score.playerId}
                  >
                    {score.verified ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <Button
          onClick={handleImport}
          disabled={loading || !scores.some((s) => s.verified)}
          size="lg"
        >
          <UserSearch className="mr-2 h-4 w-4" />
          Import {scores.filter((s) => s.verified).length} Verified Scores
        </Button>
      </div>
    </div>
  );
};

export default ScoreReview;
