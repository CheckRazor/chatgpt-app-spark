import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, X, UserPlus } from "lucide-react";
import { z } from "zod";

interface Player {
  id: string;
  canonical_name: string;
  aliases: string[];
  is_alt: boolean;
  main_player_id: string | null;
  status: string;
  joined_at: string;
}

interface PlayerDialogProps {
  player: Player | null;
  open: boolean;
  onClose: () => void;
}

const playerSchema = z.object({
  canonical_name: z.string().trim().min(1, "Name is required").max(100),
  aliases: z.array(z.string()),
  is_alt: z.boolean(),
  main_player_id: z.string().uuid().nullable(),
  status: z.enum(["active", "inactive"]),
});

const PlayerDialog = ({ player, open, onClose }: PlayerDialogProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [isAlt, setIsAlt] = useState(false);
  const [mainPlayerId, setMainPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const { data: mainPlayers } = useQuery({
    queryKey: ["main-players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, canonical_name")
        .eq("is_alt", false)
        .order("canonical_name");
      
      if (error) throw error;
      return data;
    },
    enabled: isAlt,
  });

  useEffect(() => {
    if (player) {
      setName(player.canonical_name);
      setAliases(player.aliases || []);
      setIsAlt(player.is_alt);
      setMainPlayerId(player.main_player_id);
      setStatus(player.status as "active" | "inactive");
    } else {
      setName("");
      setAliases([]);
      setIsAlt(false);
      setMainPlayerId(null);
      setStatus("active");
    }
    setAliasInput("");
  }, [player, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validation = playerSchema.safeParse({
        canonical_name: name,
        aliases,
        is_alt: isAlt,
        main_player_id: isAlt ? mainPlayerId : null,
        status,
      });

      if (!validation.success) {
        throw new Error(validation.error.errors[0].message);
      }

      if (isAlt && !mainPlayerId) {
        throw new Error("Alt accounts must be linked to a main player");
      }

      const playerData = {
        canonical_name: name.trim(),
        aliases,
        is_alt: isAlt,
        main_player_id: isAlt ? mainPlayerId : null,
        status,
      };

      if (player) {
        const { error } = await supabase
          .from("players")
          .update(playerData)
          .eq("id", player.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("players")
          .insert([playerData]);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["main-players"] });
      toast.success(player ? "Player updated" : "Player created");
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const addAlias = () => {
    const trimmed = aliasInput.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
      setAliasInput("");
    }
  };

  const removeAlias = (alias: string) => {
    setAliases(aliases.filter((a) => a !== alias));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {player ? "Edit Player" : "Create Player"}
          </DialogTitle>
          <DialogDescription>
            {player ? "Update player information" : "Add a new player to the system"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Canonical Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Player Name"
            />
          </div>

          <div className="space-y-2">
            <Label>Aliases</Label>
            <div className="flex gap-2">
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())}
                placeholder="Add alias"
              />
              <Button type="button" onClick={addAlias} size="sm">
                Add
              </Button>
            </div>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {aliases.map((alias) => (
                  <Badge key={alias} variant="secondary">
                    {alias}
                    <button
                      onClick={() => removeAlias(alias)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is-alt">Alt Account</Label>
            <Switch
              id="is-alt"
              checked={isAlt}
              onCheckedChange={setIsAlt}
            />
          </div>

          {isAlt && (
            <div className="space-y-2">
              <Label htmlFor="main-player">Main Player *</Label>
              <Select value={mainPlayerId || ""} onValueChange={setMainPlayerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select main player" />
                </SelectTrigger>
                <SelectContent>
                  {mainPlayers?.map((mp) => (
                    <SelectItem key={mp.id} value={mp.id}>
                      {mp.canonical_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex-1"
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlayerDialog;
