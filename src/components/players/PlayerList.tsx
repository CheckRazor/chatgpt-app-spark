import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, UserMinus, Users as UsersIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Player {
  id: string;
  canonical_name: string;
  aliases: string[];
  is_alt: boolean;
  main_player_id: string | null;
  status: string;
  joined_at: string;
}

interface PlayerListProps {
  onEdit: (player: Player) => void;
}

const PlayerList = ({ onEdit }: PlayerListProps) => {
  const { data: players, isLoading, error } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .order("canonical_name");
      
      if (error) throw error;
      return data as Player[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-destructive">
          Error loading players: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (!players || players.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <UsersIcon className="mx-auto mb-2 h-12 w-12 opacity-50" />
          <p>No players found. Create your first player to get started.</p>
        </CardContent>
      </Card>
    );
  }

  const mainPlayers = players.filter((p) => !p.is_alt);
  const getAlts = (mainId: string) => players.filter((p) => p.main_player_id === mainId);

  return (
    <div className="space-y-3">
      {mainPlayers.map((player) => {
        const alts = getAlts(player.id);
        
        return (
          <Card key={player.id} className={player.status === "inactive" ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {player.canonical_name}
                    {player.status === "inactive" && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </CardTitle>
                  {player.aliases && player.aliases.length > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Aliases: {player.aliases.join(", ")}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(player)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            {alts.length > 0 && (
              <CardContent className="pt-0">
                <div className="rounded-md border bg-muted/50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <UserMinus className="h-4 w-4" />
                    Alt Accounts ({alts.length})
                  </div>
                  <div className="space-y-1">
                    {alts.map((alt) => (
                      <div
                        key={alt.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className={alt.status === "inactive" ? "opacity-60" : ""}>
                          {alt.canonical_name}
                          {alt.status === "inactive" && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Inactive
                            </Badge>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(alt)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default PlayerList;
