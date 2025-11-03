// src/pages/EventDetails.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import EventTotals from "@/components/event-details/EventTotals";
import RaffleManager from "@/components/event-details/RaffleManager";
import WeightedDistribution from "@/components/event-details/WeightedDistribution";
import LedgerView from "@/components/event-details/LedgerView";
import EventScoresList from "@/components/event-details/EventScoresList";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Event {
  id: string;
  name: string;
  event_date: string;
}

const EventDetails = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, loading, isAdmin, isLeader } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);

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

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{event.name} - Management</CardTitle>
            <CardDescription>
              Manage totals, committed scores, raffles, and view ledger
              transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="totals">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="totals">Event Totals</TabsTrigger>
                <TabsTrigger value="scores">Committed Scores</TabsTrigger>
                <TabsTrigger value="raffles">Raffles</TabsTrigger>
                <TabsTrigger value="ledger">Ledger</TabsTrigger>
              </TabsList>

              <TabsContent value="totals" className="mt-6">
                <EventTotals eventId={eventId!} canManage={canManage} />
              </TabsContent>

              <TabsContent value="scores" className="mt-6">
                <EventScoresList
                  eventId={eventId!}
                  eventName={event.name}
                  canManage={canManage}
                />
              </TabsContent>

              <TabsContent value="raffles" className="mt-6">
                <div className="space-y-6">
                  <RaffleManager eventId={eventId!} canManage={canManage} />
                  <WeightedDistribution eventId={eventId!} canManage={canManage} />
                </div>
              </TabsContent>

              <TabsContent value="ledger" className="mt-6">
                <LedgerView eventId={eventId!} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default EventDetails;
