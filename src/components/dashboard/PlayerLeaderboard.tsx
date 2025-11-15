import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Award } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MedalBalance {
  medal_id: string;
  medal_name: string;
  medal_color?: string;
  amount: number;
  value: number;
}

interface PlayerBalance {
  player_id: string;
  player_name: string;
  medal_balances: MedalBalance[];
  total_value: number;
}

const PlayerLeaderboard = () => {
  const { data: balances, isLoading, error } = useQuery({
    queryKey: ["player-balances-v2"],
    queryFn: async () => {
      // 1) Fetch all medals
      const { data: medals, error: medalsError } = await supabase
        .from("medals")
        .select("*")
        .order("value", { ascending: false });

      if (medalsError) throw medalsError;

      // Create a medal lookup map
      const medalMap = new Map(medals?.map(m => [m.id, m]) || []);

      // 2) Pull ONLY ledger transactions that belong to ACTIVE (non-deleted) events
      const { data: transactions, error: txError } = await supabase
        .from("ledger_transactions")
        .select(
          `
          player_id,
          medal_id,
          amount,
          event_id,
          players!inner(canonical_name),
          events!inner(id, deleted_at)
        `
        )
        .is("events.deleted_at", null);

      if (txError) throw txError;

      // 3) Aggregate per player and medal
      const balanceMap = new Map<string, PlayerBalance>();

      (transactions || []).forEach((tx: any) => {
        if (!tx.events || tx.events.deleted_at) {
          return;
        }

        const playerId = tx.player_id;
        const playerName = tx.players?.canonical_name || "Unknown";
        const medal = medalMap.get(tx.medal_id);

        if (!medal) return;

        if (!balanceMap.has(playerId)) {
          balanceMap.set(playerId, {
            player_id: playerId,
            player_name: playerName,
            medal_balances: [],
            total_value: 0,
          });
        }

        const balance = balanceMap.get(playerId)!;

        // Find or create medal balance entry
        let medalBalance = balance.medal_balances.find(mb => mb.medal_id === tx.medal_id);
        if (!medalBalance) {
          medalBalance = {
            medal_id: tx.medal_id,
            medal_name: medal.name,
            medal_color: medal.color,
            amount: 0,
            value: medal.value,
          };
          balance.medal_balances.push(medalBalance);
        }

        medalBalance.amount += tx.amount;
        balance.total_value += tx.amount * medal.value;
      });

      // 4) Sort + limit
      return Array.from(balanceMap.values())
        .sort((a, b) => b.total_value - a.total_value)
        .slice(0, 10);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load leaderboard</AlertDescription>
      </Alert>
    );
  }

  if (!balances || balances.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No player data available yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {balances.map((balance, index) => (
        <div
          key={balance.player_id}
          className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {index + 1}
            </div>
            {index === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
            {index === 1 && <Medal className="h-5 w-5 text-gray-400" />}
            {index === 2 && <Award className="h-5 w-5 text-amber-600" />}
            <span className="font-medium">{balance.player_name}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {balance.medal_balances.slice(0, 3).map((medalBalance) => (
              <div key={medalBalance.medal_id} className="flex items-center gap-1">
                <span className="font-medium text-muted-foreground">
                  {medalBalance.medal_name}:
                </span>
                <span>{medalBalance.amount.toLocaleString()}</span>
              </div>
            ))}
            <div className="ml-2 font-bold text-primary">
              {balance.total_value.toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PlayerLeaderboard;
