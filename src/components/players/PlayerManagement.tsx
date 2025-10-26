import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Merge, UserX, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PlayerManagement = () => {
  const queryClient = useQueryClient();
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [convertPlayerId, setConvertPlayerId] = useState("");
  const [deletePlayerId, setDeletePlayerId] = useState("");

  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .order("canonical_name");
      if (error) throw error;
      return data;
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!mergeSourceId || !mergeTargetId) {
        throw new Error("Both source and target players must be selected");
      }
      if (mergeSourceId === mergeTargetId) {
        throw new Error("Cannot merge a player with itself");
      }

      // Update all scores, ledger transactions, and raffle entries to point to target
      const { error: scoresError } = await supabase
        .from("scores")
        .update({ player_id: mergeTargetId })
        .eq("player_id", mergeSourceId);

      if (scoresError) throw scoresError;

      const { error: ledgerError } = await supabase
        .from("ledger_transactions")
        .update({ player_id: mergeTargetId })
        .eq("player_id", mergeSourceId);

      if (ledgerError) throw ledgerError;

      const { error: raffleError } = await supabase
        .from("raffle_entries")
        .update({ player_id: mergeTargetId })
        .eq("player_id", mergeSourceId);

      if (raffleError) throw raffleError;

      // Update alt accounts to point to new main
      const { error: altsError } = await supabase
        .from("players")
        .update({ main_player_id: mergeTargetId })
        .eq("main_player_id", mergeSourceId);

      if (altsError) throw altsError;

      // Soft delete the source player
      const { error: deleteError } = await supabase
        .from("players")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", mergeSourceId);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      queryClient.invalidateQueries({ queryKey: ["ledger_transactions"] });
      toast.success("Players merged successfully");
      setMergeSourceId("");
      setMergeTargetId("");
    },
    onError: (error: Error) => {
      toast.error(`Failed to merge players: ${error.message}`);
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!convertPlayerId) {
        throw new Error("Player must be selected");
      }

      const player = players?.find(p => p.id === convertPlayerId);
      if (!player) throw new Error("Player not found");

      // Toggle between alt and main
      const newIsAlt = !player.is_alt;
      const updates: any = { is_alt: newIsAlt };

      if (newIsAlt) {
        // Converting to alt - needs a main player
        if (!player.main_player_id) {
          throw new Error("Cannot convert to alt without specifying a main player");
        }
      } else {
        // Converting to main - remove main player reference
        updates.main_player_id = null;
      }

      const { error } = await supabase
        .from("players")
        .update(updates)
        .eq("id", convertPlayerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success("Player converted successfully");
      setConvertPlayerId("");
    },
    onError: (error: Error) => {
      toast.error(`Failed to convert player: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deletePlayerId) {
        throw new Error("Player must be selected");
      }

      // Check if player has any data
      const { data: scores } = await supabase
        .from("scores")
        .select("id")
        .eq("player_id", deletePlayerId)
        .limit(1);

      const { data: transactions } = await supabase
        .from("ledger_transactions")
        .select("id")
        .eq("player_id", deletePlayerId)
        .limit(1);

      if ((scores && scores.length > 0) || (transactions && transactions.length > 0)) {
        // Soft delete if has data
        const { error } = await supabase
          .from("players")
          .update({ 
            deleted_at: new Date().toISOString(),
            status: "inactive"
          })
          .eq("id", deletePlayerId);

        if (error) throw error;
      } else {
        // Hard delete if no data
        const { error } = await supabase
          .from("players")
          .delete()
          .eq("id", deletePlayerId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success("Player deleted successfully");
      setDeletePlayerId("");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete player: ${error.message}`);
    },
  });

  const mainPlayers = players?.filter(p => !p.is_alt && !p.deleted_at);
  const activePlayers = players?.filter(p => !p.deleted_at);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Players
          </CardTitle>
          <CardDescription>
            Combine duplicate players by moving all data to the target player
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Source Player (will be deleted)</Label>
            <Select value={mergeSourceId} onValueChange={setMergeSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select source player" />
              </SelectTrigger>
              <SelectContent>
                {activePlayers?.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.canonical_name} {player.is_alt && "(Alt)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Target Player (will receive all data)</Label>
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target player" />
              </SelectTrigger>
              <SelectContent>
                {activePlayers?.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.canonical_name} {player.is_alt && "(Alt)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={!mergeSourceId || !mergeTargetId || mergeMutation.isPending}
                className="w-full"
              >
                {mergeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <Merge className="mr-2 h-4 w-4" />
                    Merge Players
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Player Merge</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move all scores, transactions, and raffle entries from the source player to the target player. The source player will be deleted. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => mergeMutation.mutate()}>
                  Merge
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Convert Player Type
          </CardTitle>
          <CardDescription>
            Convert between main and alt account status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Player</Label>
            <Select value={convertPlayerId} onValueChange={setConvertPlayerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select player to convert" />
              </SelectTrigger>
              <SelectContent>
                {activePlayers?.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.canonical_name} {player.is_alt ? "(Alt → Main)" : "(Main → Alt)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => convertMutation.mutate()}
            disabled={!convertPlayerId || convertMutation.isPending}
            className="w-full"
          >
            {convertMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Convert Type
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5" />
            Delete Player
          </CardTitle>
          <CardDescription>
            Remove a player (soft delete if has data, hard delete otherwise)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Player</Label>
            <Select value={deletePlayerId} onValueChange={setDeletePlayerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select player to delete" />
              </SelectTrigger>
              <SelectContent>
                {activePlayers?.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.canonical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={!deletePlayerId || deleteMutation.isPending}
                className="w-full"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <UserX className="mr-2 h-4 w-4" />
                    Delete Player
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Player Deletion</AlertDialogTitle>
                <AlertDialogDescription>
                  If this player has scores or transactions, they will be soft-deleted (marked as inactive). Otherwise, they will be permanently deleted. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlayerManagement;
