import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Shuffle, Trophy, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Medal {
  id: string;
  name: string;
}

interface Raffle {
  id: string;
  name: string;
  medal_id: string;
  total_prizes: number;
  status: string;
  medals?: Medal;
}

interface RaffleWinner {
  player_id: string;
  player_name: string;
  prize_amount: number;
  created_at: string;
}

interface RaffleManagerProps {
  eventId: string;
  canManage: boolean;
}

const RAFFLE_WIN_AMOUNT = 25000000; // 25M medals per win

const RaffleManager = ({ eventId, canManage }: RaffleManagerProps) => {
  const [medals, setMedals] = useState<Medal[]>([]);
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [raffleWinners, setRaffleWinners] = useState<Record<string, RaffleWinner[]>>({});
  const [newRaffle, setNewRaffle] = useState({
    name: "",
    medalId: "",
    totalPrizes: 1,
  });

  useEffect(() => {
    fetchMedals();
    fetchRaffles();
  }, [eventId]);

  const fetchMedals = async () => {
    const { data } = await supabase.from("medals").select("*");
    if (data) setMedals(data);
  };

  const fetchRaffles = async () => {
    const { data } = await supabase
      .from("raffles")
      .select("*, medals(*)")
      .eq("event_id", eventId);
    if (data) {
      setRaffles(data);
      // Fetch winners for completed raffles
      for (const raffle of data) {
        if (raffle.status === "completed") {
          fetchRaffleWinners(raffle.id);
        }
      }
    }
  };

  const fetchRaffleWinners = async (raffleId: string) => {
    const { data } = await supabase
      .from("raffle_entries")
      .select("player_id, prize_amount, created_at, players(canonical_name)")
      .eq("raffle_id", raffleId)
      .eq("is_winner", true)
      .order("created_at", { ascending: true });

    if (data) {
      const winners = data.map(entry => ({
        player_id: entry.player_id,
        player_name: (entry.players as any)?.canonical_name || "Unknown",
        prize_amount: entry.prize_amount || 0,
        created_at: entry.created_at,
      }));
      setRaffleWinners(prev => ({ ...prev, [raffleId]: winners }));
    }
  };

  const handleCreateRaffle = async () => {
    if (!canManage) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("raffles").insert([{
        event_id: eventId,
        name: newRaffle.name,
        medal_id: newRaffle.medalId,
        total_prizes: newRaffle.totalPrizes,
        weight_formula: "score",
        created_by: user.id,
      }]);

      if (error) throw error;

      toast.success("Raffle created successfully");
      setNewRaffle({ name: "", medalId: "", totalPrizes: 1 });
      fetchRaffles();
    } catch (error: any) {
      toast.error("Failed to create raffle: " + error.message);
    }
  };

  const handleDrawRaffle = async (raffleId: string) => {
    if (!canManage) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get event totals to find min_score_for_raffle
      const { data: eventTotals } = await supabase
        .from("event_totals")
        .select("min_score_for_raffle")
        .eq("event_id", eventId)
        .limit(1)
        .maybeSingle();

      const minScore = eventTotals?.min_score_for_raffle || 0;

      // Get qualified players (score >= min_score_for_raffle)
      const { data: scores } = await supabase
        .from("scores")
        .select("player_id, score, players(canonical_name)")
        .eq("event_id", eventId)
        .gte("score", minScore);

      if (!scores || scores.length === 0) {
        toast.error("No qualified players for this event");
        return;
      }

      // Get carryover entries from raffle_weights
      const { data: carryovers } = await supabase
        .from("raffle_weights")
        .select("player_id, entries_next")
        .eq("event_id", eventId);

      const carryoverMap = new Map<string, number>();
      carryovers?.forEach(c => carryoverMap.set(c.player_id, c.entries_next || 0));

      // Build weighted pool: base_entries (1) + carryover
      const weightedPool: { player_id: string; entries: number; name: string }[] = [];
      scores.forEach(score => {
        const baseEntries = 1;
        const carryover = carryoverMap.get(score.player_id) || 0;
        const totalEntries = baseEntries + carryover;
        
        // Add player to pool multiple times based on their entries
        for (let i = 0; i < totalEntries; i++) {
          weightedPool.push({
            player_id: score.player_id,
            entries: totalEntries,
            name: (score.players as any)?.canonical_name || "Unknown",
          });
        }
      });

      const raffle = raffles.find(r => r.id === raffleId);
      if (!raffle) return;

      // Draw winners (1 win per player)
      const winners = new Set<string>();
      const winnersList: { player_id: string; name: string }[] = [];
      let remainingPool = [...weightedPool];

      while (winners.size < raffle.total_prizes && remainingPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * remainingPool.length);
        const selected = remainingPool[randomIndex];
        
        if (!winners.has(selected.player_id)) {
          winners.add(selected.player_id);
          winnersList.push({ player_id: selected.player_id, name: selected.name });
          // Remove all entries for this player from pool
          remainingPool = remainingPool.filter(p => p.player_id !== selected.player_id);
        }
      }

      // Create batch operation
      const { data: batchOp, error: batchError } = await supabase
        .from("batch_operations")
        .insert({
          operation_type: "raffle_draw",
          event_id: eventId,
          created_by: user.id,
          metadata: {
            raffle_id: raffleId,
            raffle_name: raffle.name,
            total_prizes: raffle.total_prizes,
            winners_count: winners.size,
            winners: winnersList.map(w => w.name),
          },
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Insert raffle entries (winners and non-winners)
      const allPlayerIds = new Set(scores.map(s => s.player_id));
      const entries = Array.from(allPlayerIds).map(playerId => ({
        raffle_id: raffleId,
        player_id: playerId,
        weight: (carryoverMap.get(playerId) || 0) + 1,
        is_winner: winners.has(playerId),
        prize_amount: winners.has(playerId) ? RAFFLE_WIN_AMOUNT : null,
        batch_operation_id: batchOp.id,
      }));

      await supabase.from("raffle_entries").insert(entries);

      // Update raffle_weights and history for all qualified players
      for (const playerId of allPlayerIds) {
        const previousCarryover = carryoverMap.get(playerId) || 0;
        const isWinner = winners.has(playerId);
        const newCarryover = isWinner ? 0 : previousCarryover + 1;

        // Upsert raffle_weights with proper conflict handling
        const { error: upsertError } = await supabase
          .from("raffle_weights")
          .upsert({
            event_id: eventId,
            player_id: playerId,
            entries_before: previousCarryover,
            entries_next: newCarryover,
            updated_by: user.id,
            last_updated: new Date().toISOString(),
          }, {
            onConflict: 'player_id,event_id'
          });

        if (upsertError) {
          console.error("Failed to upsert raffle_weights:", upsertError);
        }

        // Insert history
        await supabase.from("raffle_entries_history").insert({
          event_id: eventId,
          player_id: playerId,
          entries_before: previousCarryover,
          entries_after: newCarryover,
          reason: isWinner ? "won_raffle_reset" : "missed_raffle_but_qualified",
          created_by: user.id,
        });
      }

      // Mark raffle as completed
      await supabase
        .from("raffles")
        .update({
          status: "completed",
          drawn_at: new Date().toISOString(),
        })
        .eq("id", raffleId);

      // Update event_totals with raffle amount used
      const raffleMedalsUsed = winners.size * RAFFLE_WIN_AMOUNT;
      const { error: updateTotalsError } = await supabase
        .from("event_totals")
        .update({ raffle_amount_used: raffleMedalsUsed })
        .eq("event_id", eventId)
        .eq("medal_id", raffle.medal_id);

      if (updateTotalsError) {
        console.error("Failed to update raffle_amount_used:", updateTotalsError);
        throw updateTotalsError;
      }

      toast.success(`Raffle drawn! ${winners.size} winners selected (${raffleMedalsUsed.toLocaleString()} medals total)`);
      fetchRaffles();
    } catch (error: any) {
      toast.error("Failed to draw raffle: " + error.message);
      console.error(error);
    }
  };

  const handleExportWinners = async (raffleId: string) => {
    try {
      const { data } = await supabase
        .from("raffle_entries")
        .select("player_id, players(canonical_name)")
        .eq("raffle_id", raffleId)
        .eq("is_winner", true)
        .order("created_at", { ascending: true });

      if (!data || data.length === 0) {
        toast.error("No winners found");
        return;
      }

      const names = data.map(entry => (entry.players as any)?.canonical_name || "Unknown");
      const exportString = names.join(", ");

      await navigator.clipboard.writeText(exportString);
      toast.success("Winners copied to clipboard!");
    } catch (error: any) {
      toast.error("Failed to export winners: " + error.message);
    }
  };

  if (!canManage && raffles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No raffles configured for this event.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Create Raffle (25M per winner)</h3>
          <div className="grid gap-4">
            <div>
              <Label>Raffle Name</Label>
              <Input
                placeholder="e.g., Gold Medal Draw"
                value={newRaffle.name}
                onChange={(e) => setNewRaffle({ ...newRaffle, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Medal Type</Label>
              <Select
                value={newRaffle.medalId}
                onValueChange={(value) => setNewRaffle({ ...newRaffle, medalId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select medal" />
                </SelectTrigger>
                <SelectContent>
                  {medals.map((medal) => (
                    <SelectItem key={medal.id} value={medal.id}>
                      {medal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Number of Prizes</Label>
              <Input
                type="number"
                min="1"
                value={newRaffle.totalPrizes}
                onChange={(e) => setNewRaffle({ ...newRaffle, totalPrizes: parseInt(e.target.value) || 1 })}
              />
            </div>
            <Button onClick={handleCreateRaffle} disabled={!newRaffle.name || !newRaffle.medalId}>
              Create Raffle
            </Button>
          </div>
        </Card>
      )}

      {raffles.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Medal</TableHead>
              <TableHead>Prizes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {raffles.map((raffle) => (
              <>
                <TableRow key={raffle.id}>
                  <TableCell className="font-medium">{raffle.name}</TableCell>
                  <TableCell>{raffle.medals?.name}</TableCell>
                  <TableCell>{raffle.total_prizes}</TableCell>
                  <TableCell>
                    <span className={raffle.status === "completed" ? "text-green-600" : "text-yellow-600"}>
                      {raffle.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && raffle.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDrawRaffle(raffle.id)}
                      >
                        <Shuffle className="h-4 w-4 mr-1" />
                        Draw Winners
                      </Button>
                    )}
                    {raffle.status === "completed" && (
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportWinners(raffle.id)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy Winners
                        </Button>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          Complete
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                {raffle.status === "completed" && raffleWinners[raffle.id] && (
                  <TableRow key={`${raffle.id}-winners`}>
                    <TableCell colSpan={5} className="bg-muted/50">
                      <div className="py-2">
                        <p className="text-sm font-medium mb-2">Winners (25M each):</p>
                        {raffleWinners[raffle.id].length > 0 ? (
                          <ul className="text-sm space-y-1">
                            {raffleWinners[raffle.id].map((winner, idx) => (
                              <li key={winner.player_id} className="flex items-center gap-2">
                                <Badge variant="outline" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                                  {idx + 1}
                                </Badge>
                                <span>{winner.player_name}</span>
                                <span className="text-muted-foreground">({winner.prize_amount.toLocaleString()} medals)</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No winners yet.</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default RaffleManager;
