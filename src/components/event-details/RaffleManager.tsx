import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Shuffle, Trophy } from "lucide-react";
import { toast } from "sonner";

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

interface RaffleManagerProps {
  eventId: string;
  canManage: boolean;
}

const RaffleManager = ({ eventId, canManage }: RaffleManagerProps) => {
  const [medals, setMedals] = useState<Medal[]>([]);
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [newRaffle, setNewRaffle] = useState({
    name: "",
    medalId: "",
    totalPrizes: 1,
    weightFormula: "score",
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
    if (data) setRaffles(data);
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
        weight_formula: newRaffle.weightFormula,
        created_by: user.id,
      }]);

      if (error) throw error;

      toast.success("Raffle created successfully");
      setNewRaffle({ name: "", medalId: "", totalPrizes: 1, weightFormula: "score" });
      fetchRaffles();
    } catch (error: any) {
      toast.error("Failed to create raffle: " + error.message);
    }
  };

  const handleDrawRaffle = async (raffleId: string) => {
    if (!canManage) return;

    try {
      const { data: scores } = await supabase
        .from("scores")
        .select("player_id, score")
        .eq("event_id", eventId);

      if (!scores || scores.length === 0) {
        toast.error("No scores available for this event");
        return;
      }

      const raffle = raffles.find(r => r.id === raffleId);
      if (!raffle) return;

      const totalWeight = scores.reduce((sum, s) => sum + s.score, 0);
      const winners = new Set<string>();

      while (winners.size < raffle.total_prizes && winners.size < scores.length) {
        let random = Math.random() * totalWeight;
        for (const score of scores) {
          random -= score.score;
          if (random <= 0) {
            winners.add(score.player_id);
            break;
          }
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const entries = scores.map(score => ({
        raffle_id: raffleId,
        player_id: score.player_id,
        weight: score.score,
        is_winner: winners.has(score.player_id),
        prize_amount: winners.has(score.player_id) ? 1 : 0,
      }));

      await supabase.from("raffle_entries").insert(entries);

      await supabase
        .from("raffles")
        .update({
          status: "completed",
          drawn_at: new Date().toISOString(),
        })
        .eq("id", raffleId);

      const winnerEntries = entries.filter(e => e.is_winner);
      for (const entry of winnerEntries) {
        await supabase.from("ledger_transactions").insert([{
          player_id: entry.player_id,
          medal_id: raffle.medal_id,
          amount: 1,
          transaction_type: "raffle_win",
          event_id: eventId,
          raffle_id: raffleId,
          description: `Won raffle: ${raffle.name}`,
          created_by: user.id,
        }]);
      }

      toast.success(`Raffle drawn! ${winners.size} winners selected`);
      fetchRaffles();
    } catch (error: any) {
      toast.error("Failed to draw raffle: " + error.message);
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
          <h3 className="font-semibold mb-4">Create Raffle</h3>
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
                    <span className="text-sm text-muted-foreground">
                      <Trophy className="h-4 w-4 inline mr-1" />
                      Complete
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default RaffleManager;
