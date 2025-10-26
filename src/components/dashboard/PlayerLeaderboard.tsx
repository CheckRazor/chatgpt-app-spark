import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Award } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PlayerBalance {
  player_id: string;
  player_name: string;
  gold: number;
  silver: number;
  bronze: number;
  total_value: number;
}

const PlayerLeaderboard = () => {
  const { data: balances, isLoading, error } = useQuery({
    queryKey: ["player-balances"],
    queryFn: async () => {
      // Get all medals
      const { data: medals, error: medalsError } = await supabase
        .from("medals")
        .select("*")
        .order("value", { ascending: false });

      if (medalsError) throw medalsError;

      const goldMedal = medals.find(m => m.name === "Gold");
      const silverMedal = medals.find(m => m.name === "Silver");
      const bronzeMedal = medals.find(m => m.name === "Bronze");

      // Get all ledger transactions
      const { data: transactions, error: txError } = await supabase
        .from("ledger_transactions")
        .select(`
          player_id,
          medal_id,
          amount,
          players!inner(canonical_name)
        `);

      if (txError) throw txError;

      // Calculate balances
      const balanceMap = new Map<string, PlayerBalance>();

      transactions.forEach(tx => {
        const playerId = tx.player_id;
        const playerName = (tx.players as any)?.canonical_name || "Unknown";
        
        if (!balanceMap.has(playerId)) {
          balanceMap.set(playerId, {
            player_id: playerId,
            player_name: playerName,
            gold: 0,
            silver: 0,
            bronze: 0,
            total_value: 0,
          });
        }

        const balance = balanceMap.get(playerId)!;
        
        if (tx.medal_id === goldMedal?.id) {
          balance.gold += tx.amount;
          balance.total_value += tx.amount * (goldMedal?.value || 0);
        } else if (tx.medal_id === silverMedal?.id) {
          balance.silver += tx.amount;
          balance.total_value += tx.amount * (silverMedal?.value || 0);
        } else if (tx.medal_id === bronzeMedal?.id) {
          balance.bronze += tx.amount;
          balance.total_value += tx.amount * (bronzeMedal?.value || 0);
        }
      });

      // Convert to array and sort by total value
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
            <div className="flex items-center gap-1">
              <span className="text-yellow-500">🥇</span>
              <span>{balance.gold}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-400">🥈</span>
              <span>{balance.silver}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-amber-600">🥉</span>
              <span>{balance.bronze}</span>
            </div>
            <div className="ml-2 font-bold text-primary">
              {balance.total_value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PlayerLeaderboard;
