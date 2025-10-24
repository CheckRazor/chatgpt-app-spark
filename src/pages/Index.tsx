import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import PlayerList from "@/components/players/PlayerList";
import PlayerDialog from "@/components/players/PlayerDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
                <CardTitle>Player Management</CardTitle>
                <CardDescription>
                  Manage player accounts and their alt accounts
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
            <PlayerList onEdit={handleEdit} />
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
