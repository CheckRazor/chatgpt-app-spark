import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import EventList from "@/components/events/EventList";
import EventDialog from "@/components/events/EventDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface Event {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  description: string | null;
}

const Events = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin, isLeader } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const canManage = isAdmin || isLeader;

  const handleEdit = (event: Event) => {
    setSelectedEvent(event);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedEvent(null);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSelectedEvent(null);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Events</CardTitle>
                <CardDescription>
                  Manage tournaments and competitions
                </CardDescription>
              </div>
              {canManage && (
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Event
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <EventList onEdit={handleEdit} canManage={canManage} />
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <EventDialog
          event={selectedEvent}
          open={dialogOpen}
          onClose={handleClose}
        />
      )}
    </Layout>
  );
};

export default Events;
