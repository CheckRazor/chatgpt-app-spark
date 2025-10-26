import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Minus } from "lucide-react";

const BulkDeductions = () => {
  const queryClient = useQueryClient();
  const [clientRef, setClientRef] = useState("");
  const [medalId, setMedalId] = useState("");
  const [amount, setAmount] = useState("");
  const [playerIds, setPlayerIds] = useState("");
  const [description, setDescription] = useState("");

  const { data: medals } = useQuery({
    queryKey: ["medals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medals")
        .select("*")
        .order("value", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, canonical_name")
        .eq("status", "active")
        .order("canonical_name");
      if (error) throw error;
      return data;
    },
  });

  const bulkDeductMutation = useMutation({
    mutationFn: async () => {
      if (!medalId || !amount || !playerIds) {
        throw new Error("Medal, amount, and players are required");
      }

      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Amount must be a positive number");
      }

      const selectedPlayers = playerIds.split(",").map(id => id.trim()).filter(Boolean);
      if (selectedPlayers.length === 0) {
        throw new Error("At least one player must be selected");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create batch operation
      const { data: batchOp, error: batchError } = await supabase
        .from("batch_operations")
        .insert({
          operation_type: "bulk_deduction",
          client_ref: clientRef || null,
          created_by: user.id,
          metadata: {
            medal_id: medalId,
            amount: parsedAmount,
            player_count: selectedPlayers.length,
            description,
          },
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Create ledger transactions for each player
      const transactions = selectedPlayers.map(playerId => ({
        player_id: playerId,
        medal_id: medalId,
        amount: -parsedAmount,
        transaction_type: "deduction",
        description: description || `Bulk deduction${clientRef ? ` - ${clientRef}` : ""}`,
        created_by: user.id,
        batch_operation_id: batchOp.id,
      }));

      const { error: transError } = await supabase
        .from("ledger_transactions")
        .insert(transactions);

      if (transError) throw transError;

      return batchOp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch_operations"] });
      queryClient.invalidateQueries({ queryKey: ["ledger_transactions"] });
      toast.success("Bulk deduction completed successfully");
      setClientRef("");
      setMedalId("");
      setAmount("");
      setPlayerIds("");
      setDescription("");
    },
    onError: (error: Error) => {
      toast.error(`Failed to process bulk deduction: ${error.message}`);
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="clientRef">Client Reference (Optional)</Label>
          <Input
            id="clientRef"
            placeholder="e.g., EVENT-2024-001"
            value={clientRef}
            onChange={(e) => setClientRef(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="medal">Medal Type</Label>
          <Select value={medalId} onValueChange={setMedalId}>
            <SelectTrigger>
              <SelectValue placeholder="Select medal type" />
            </SelectTrigger>
            <SelectContent>
              {medals?.map((medal) => (
                <SelectItem key={medal.id} value={medal.id}>
                  {medal.name} ({medal.value})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount to Deduct</Label>
          <Input
            id="amount"
            type="number"
            min="1"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="players">Player IDs (comma-separated)</Label>
          <Textarea
            id="players"
            placeholder="Paste player IDs separated by commas"
            value={playerIds}
            onChange={(e) => setPlayerIds(e.target.value)}
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            {players && `${players.length} active players available`}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            placeholder="Reason for deduction"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <Button
          onClick={() => bulkDeductMutation.mutate()}
          disabled={bulkDeductMutation.isPending || !medalId || !amount || !playerIds}
          className="w-full"
        >
          {bulkDeductMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Minus className="mr-2 h-4 w-4" />
              Process Bulk Deduction
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default BulkDeductions;
