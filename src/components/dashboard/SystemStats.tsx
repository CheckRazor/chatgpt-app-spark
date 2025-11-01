import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, Trophy, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SystemStats = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["system-stats-v2"],
    queryFn: async () => {
      //
      // 1) get ONLY active (non-deleted) events
      //
      const { data: eventsRes, error: eventsErr } = await supabase
        .from("events")
        .select("id")
        .is("deleted_at", null);

      if (eventsErr) throw eventsErr;

      const activeEventIds = (eventsRes || []).map((e) => e.id);

      //
      // 2) players count (active only, same as before)
      //
      const { count: playersCount, error: playersErr } = await supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      if (playersErr) throw playersErr;

      //
      // 3) events count = # of non-deleted events
      //
      const eventsCount = activeEventIds.length;

      //
      // 4) scores & transactions MUST be filtered to those events
      //    if no active events → 0
      //
      let scoresCount = 0;
      let transactionsCount = 0;

      if (activeEventIds.length > 0) {
        // scores tied to active events
        const { count: sCount, error: sErr } = await supabase
          .from("scores")
          .select("id", { count: "exact", head: true })
          .in("event_id", activeEventIds);

        if (sErr) throw sErr;
        scoresCount = sCount || 0;

        // ledger tx tied to active events
        const { count: tCount, error: tErr } = await supabase
          .from("ledger_transactions")
          .select("id", { count: "exact", head: true })
          .in("event_id", activeEventIds);

        if (tErr) throw tErr;
        transactionsCount = tCount || 0;
      }

      return {
        players: playersCount || 0,
        events: eventsCount,
        scores: scoresCount,
        transactions: transactionsCount,
      };
    },
  });

  const statCards = [
    {
      title: "Active Players",
      value: stats?.players || 0,
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "Total Events",
      value: stats?.events || 0,
      icon: Calendar,
      color: "text-green-500",
    },
    {
      title: "Scores Recorded",
      value: stats?.scores || 0,
      icon: Trophy,
      color: "text-yellow-500",
    },
    {
      title: "Transactions",
      value: stats?.transactions || 0,
      icon: Activity,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stat.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SystemStats;
