import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, Trophy, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SystemStats = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["system-stats"],
    queryFn: async () => {
      const [playersRes, eventsRes, scoresRes, transactionsRes] = await Promise.all([
        supabase.from("players").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("events").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("scores").select("id", { count: "exact", head: true }),
        supabase.from("ledger_transactions").select("id", { count: "exact", head: true }),
      ]);

      return {
        players: playersRes.count || 0,
        events: eventsRes.count || 0,
        scores: scoresRes.count || 0,
        transactions: transactionsRes.count || 0,
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
