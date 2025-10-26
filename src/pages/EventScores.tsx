import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import OCRUpload from "@/components/scores/OCRUpload";
import ScoreReview from "@/components/scores/ScoreReview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import ExportButtons from "@/components/exports/ExportButtons";
import { exportScoresCSV, formatDiscordLeaderboard } from "@/lib/exports";

interface Event {
  id: string;
  name: string;
  event_date: string;
}

const EventScores = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, loading, isAdmin, isLeader } = useAuth();
  const [parsedScores, setParsedScores] = useState<any[]>([]);

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (error) {
        toast.error("Event not found");
        navigate("/events");
        return null;
      }
      return data;
    },
    enabled: !!eventId,
  });

  const scoresQuery = useQuery({
    queryKey: ["scores", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("scores")
        .select("*, players(canonical_name)")
        .eq("event_id", eventId)
        .order("rank");
      
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (!event) {
    return null;
  }

  const canManage = isAdmin || isLeader;

  const handleOCRComplete = (scores: any[]) => {
    setParsedScores(scores);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{event.name} - Scores</CardTitle>
                <CardDescription>
                  Upload score sheets and manage event results
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <ExportButtons
                  onDiscordExport={() => {
                    const scores = scoresQuery.data || [];
                    const entries = scores.map((s: any, idx: number) => ({
                      rank: s.rank || idx + 1,
                      player_name: s.players?.canonical_name || "Unknown",
                      score: s.score,
                    }));
                    return formatDiscordLeaderboard(entries, event?.name || "Event Scores");
                  }}
                  onCSVExport={() => {
                    const scores = scoresQuery.data || [];
                    exportScoresCSV(scores, event?.name || "event");
                  }}
                  label="Export Scores"
                />
                <Button variant="outline" onClick={() => navigate("/events")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Events
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="upload">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload & Scan</TabsTrigger>
                <TabsTrigger value="review">Review & Import</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="mt-6">
                <OCRUpload
                  eventId={eventId!}
                  onComplete={handleOCRComplete}
                  canManage={canManage}
                />
              </TabsContent>
              <TabsContent value="review" className="mt-6">
                <ScoreReview
                  eventId={eventId!}
                  parsedScores={parsedScores}
                  canManage={canManage}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default EventScores;
