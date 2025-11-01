// src/components/event-details/EventScoresList.tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ExportButtons from "@/components/exports/ExportButtons";

interface EventScoresListProps {
  eventId: string;
  eventName?: string;
  canManage: boolean;
}

// quick local CSV helper so we don't have to touch src/lib/exports.ts
const downloadCSV = (filename: string, rows: string[][]) => {
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const EventScoresList = ({
  eventId,
  eventName = "Event Scores",
  canManage,
}: EventScoresListProps) => {
  const {
    data: scores,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["event-scores", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scores")
        .select(
          `
          id,
          player_id,
          score,
          raw_score,
          verified,
          created_at,
          players (canonical_name)
        `
        )
        .eq("event_id", eventId)
        .order("score", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const leaderboard = useMemo(() => {
    if (!scores) return [];
    return scores.map((s: any, i: number) => ({
      rank: i + 1,
      player: s.players?.canonical_name || "Unknown",
      score: s.score ?? 0,
      verified: !!s.verified,
      created_at: s.created_at,
    }));
  }, [scores]);

  if (isLoading) {
    return <div className="text-muted-foreground py-4">Loading scores…</div>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load committed scores for this event.
        </AlertDescription>
      </Alert>
    );
  }

  if (!scores || scores.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Committed Scores</h3>
        </div>
        <div className="text-muted-foreground text-center py-6 text-sm">
          No committed scores yet for this event.
          <br />
          Go to **Bulk / OCR → Review** and “Commit Verified Scores” first.
        </div>
      </div>
    );
  }

  const handleCSVExport = () => {
    const header = ["Rank", "Player", "Score", "Verified", "Committed At"];
    const rows = leaderboard.map((row) => [
      String(row.rank),
      row.player,
      String(row.score),
      row.verified ? "yes" : "no",
      row.created_at ? new Date(row.created_at).toISOString() : "",
    ]);
    downloadCSV(
      `${eventName.replace(/\s+/g, "_").toLowerCase()}_scores.csv`,
      [header, ...rows]
    );
  };

  const handleDiscordExport = () => {
    // ExportButtons expects a string back
    const lines = [
      `**${eventName} – Scores**`,
      ...leaderboard.slice(0, 25).map((row) => {
        const padRank = row.rank.toString().padStart(2, " ");
        return `#${padRank} ${row.player} — ${row.score.toLocaleString()}${
          row.verified ? " ✅" : ""
        }`;
      }),
    ];
    return lines.join("\n");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h3 className="font-semibold text-lg">
          Committed Scores ({leaderboard.length})
        </h3>
        <ExportButtons
          label="Export Scores"
          onCSVExport={handleCSVExport}
          onDiscordExport={handleDiscordExport}
        />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Committed At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((row) => (
              <TableRow key={`${row.player}-${row.rank}`}>
                <TableCell className="font-mono text-sm">{row.rank}</TableCell>
                <TableCell className="font-medium">{row.player}</TableCell>
                <TableCell>{row.score.toLocaleString()}</TableCell>
                <TableCell>
                  {row.verified ? (
                    <Badge variant="default">Verified</Badge>
                  ) : (
                    <Badge variant="outline">Unverified</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.created_at
                    ? new Date(row.created_at).toLocaleString()
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!canManage && (
        <p className="text-xs text-muted-foreground">
          View-only: event admins/leaders can change scores from the OCR →
          Review screen.
        </p>
      )}
    </div>
  );
};

export default EventScoresList;
