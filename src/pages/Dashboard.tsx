import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PlayerLeaderboard from "@/components/dashboard/PlayerLeaderboard";
import RecentEvents from "@/components/dashboard/RecentEvents";
import SystemStats from "@/components/dashboard/SystemStats";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of medal standings and recent activity
          </p>
        </div>

        <SystemStats />

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Players</CardTitle>
              <CardDescription>
                Players ranked by total medal value
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlayerLeaderboard />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
              <CardDescription>
                Latest events and scores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecentEvents />
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
