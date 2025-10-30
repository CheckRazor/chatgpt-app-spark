// src/pages/EventScores.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import MultiFileOCRUpload from "@/components/scores/MultiFileOCRUpload";
import EnhancedScoreReview from "@/components/scores/EnhancedScoreReview";
import RaffleReweightButton from "@/components/scores/RaffleReweightButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import ExportButtons from "@/components/exports/ExportButtons";
import { exportScoresCSV, formatDiscordLeaderboard } from "@/lib/exports";

const EventScores = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, loading, isAdmin, isLeader } = useAuth();

  const [event, setEvent] = useState<any>(null);
  const [committedScores, setCommittedScores] = useState<any[]>([]);
  const [parsedScores, setParsedScores] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"upload" | "review">("upload");

  // load event + existing scores the simple way (no react-query)
  useEffect(() => {
    const load = async () => {
      if (!eventId) return;
      // 1) event
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();

      if (evErr) {
        toast.error("Event not found");
        navigate("/events");
        return;
      }
      setEvent(ev);

      // 2) existing scores for exports
      const { data: sc, error: scErr } = await supabase
        .from("scores")
        .select("*, players(canonical_name)")
        .eq("event_id", eventId)
        .order("rank");

      if (!scErr && sc) {
        setCommittedScores(sc);
      }
    };

    load();
  }, [eventId, navigate]);

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

  // 👇 this is what the uploader will call
  const handleOCRProcessed = (rows: any[]) => {
    setParsedScores(rows);
    setActiveTab("review");
    toast.success(`Loaded ${rows.length} rows for review`);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>{event.name} - Scores</CardTitle>
                <CardDescription>
                  Upload score sheets and manage event results
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <RaffleReweightButton
                  eventId={eventId!}
                  eventName={event?.name || "Event"}
                  canManage={canManage}
                />
                <ExportButtons
                  onDiscordExport={() => {
                    const entries = (committedScores || []).map(
                      (s: any, idx: number) => ({
                        rank: s.rank || idx + 1,
                        player_name: s.players?.canonical_name || "Unknown",
                        score: s.score,
                      })
                    );
                    return formatDiscordLeaderboard(
                      entries,
                      event?.name || "Event Scores"
                    );
                  }}
                  onCSVExport={() => {
                    exportScoresCSV(
                      committedScores || [],
                      event?.name || "event"
                    );
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
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "upload" | "review")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload &amp; Scan</TabsTrigger>
                <TabsTrigger value="review">Review &amp; Import</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-6">
                <MultiFileOCRUpload
                  // 👇 these two are why TS yelled — we add them to component next
                  eventId={eventId!}
                  canManage={canManage}
                  onProcessed={handleOCRProcessed}
                />
              </TabsContent>

              <TabsContent value="review" className="mt-6">
                <EnhancedScoreReview
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
