import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import OCRUpload from "@/components/scores/OCRUpload";
import ScoreReview from "@/components/scores/ScoreReview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Event {
  id: string;
  name: string;
  event_date: string;
}

const EventScores = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, loading, isAdmin, isLeader } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [parsedScores, setParsedScores] = useState<any[]>([]);

  useEffect(() => {
    if (!eventId) return;

    const fetchEvent = async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (error) {
        toast.error("Event not found");
        navigate("/events");
        return;
      }

      setEvent(data);
    };

    fetchEvent();
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

  const handleOCRComplete = (scores: any[]) => {
    setParsedScores(scores);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{event.name} - Scores</CardTitle>
            <CardDescription>
              Upload score sheets and manage event results
            </CardDescription>
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
