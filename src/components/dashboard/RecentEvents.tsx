import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

const RecentEvents = () => {
  const { data: events, isLoading, error } = useQuery({
    queryKey: ["recent-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(`
          id,
          name,
          event_date,
          location,
          scores(count)
        `)
        .is("deleted_at", null)
        .order("event_date", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load recent events</AlertDescription>
      </Alert>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No events found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const scoreCount = Array.isArray(event.scores) ? event.scores.length : 0;
        
        return (
          <div
            key={event.id}
            className="rounded-lg border p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h4 className="font-semibold">{event.name}</h4>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(event.event_date).toLocaleDateString()}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {event.location}
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {scoreCount} {scoreCount === 1 ? "score" : "scores"} recorded
                </div>
              </div>
              <Link to={`/events/${event.id}/details`}>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RecentEvents;
