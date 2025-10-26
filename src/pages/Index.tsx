import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import PlayerList from "@/components/players/PlayerList";
import PlayerDialog from "@/components/players/PlayerDialog";
import PlayerManagement from "@/components/players/PlayerManagement";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus } from "lucide-react";

interface Player {
  id: string;
  canonical_name: string;
  aliases: string[];
  is_alt: boolean;
  main_player_id: string | null;
  status: string;
  joined_at: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const handleEdit = (player: Player) => {
    setSelectedPlayer(player);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedPlayer(null);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSelectedPlayer(null);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Players</CardTitle>
                <CardDescription>
                  Manage your player roster and advanced operations
                </CardDescription>
              </div>
              {isAdmin && (
                <Button onClick={handleCreate}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Player
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="list">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="list">Player List</TabsTrigger>
                {isAdmin && <TabsTrigger value="management">Management</TabsTrigger>}
              </TabsList>
              <TabsContent value="list" className="mt-6">
                <PlayerList onEdit={handleEdit} />
              </TabsContent>
              {isAdmin && (
                <TabsContent value="management" className="mt-6">
                  <PlayerManagement />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <PlayerDialog
          player={selectedPlayer}
          open={dialogOpen}
          onClose={handleClose}
        />
      )}
    </Layout>
  );
};

export default Index;
