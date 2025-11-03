import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calculator } from "lucide-react";
import { toast } from "sonner";

interface WeightedDistributionProps {
  eventId: string;
  canManage: boolean;
}

const WeightedDistribution = ({ eventId, canManage }: WeightedDistributionProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDistribute = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get event totals
      const { data: eventTotals } = await supabase
        .from("event_totals")
        .select("id, medal_id, total_amount, raffle_amount_used, distributed_amount, min_score_for_raffle")
        .eq("event_id", eventId);

      if (!eventTotals || eventTotals.length === 0) {
        throw new Error("No event totals configured");
      }

      // Process each medal type
      for (const total of eventTotals) {
        const minScore = total.min_score_for_raffle || 0;
        
        // Calculate remaining medals correctly
        const totalPot = total.total_amount;
        const raffleUsed = total.raffle_amount_used || 0;
        const alreadyDistributed = total.distributed_amount || 0;
        const remainingMedals = totalPot - raffleUsed - alreadyDistributed;

        if (remainingMedals <= 0) {
          toast.info(`No remaining medals to distribute for this event/medal.`);
          continue;
        }

        // Get qualified players (same pool as raffle) - INCLUDES raffle winners
        const { data: scores } = await supabase
          .from("scores")
          .select("player_id, score")
          .eq("event_id", eventId)
          .gte("score", minScore);

        if (!scores || scores.length === 0) {
          toast.info("No qualified players for weighted distribution");
          continue;
        }

        // Calculate total score for proportional distribution
        const totalScore = scores.reduce((sum, s) => sum + Number(s.score), 0);

        if (totalScore === 0) {
          throw new Error("Total score is zero, cannot distribute");
        }

        // Calculate 10% cap
        const maxPerPlayer = Math.floor(remainingMedals * 0.10);

        // Calculate shares with 10% cap
        const distributions: { player_id: string; amount: number }[] = [];
        let totalDistributed = 0;

        for (const score of scores) {
          const rawShare = Math.floor((Number(score.score) / totalScore) * remainingMedals);
          const cappedShare = Math.min(rawShare, maxPerPlayer);
          
          if (cappedShare > 0) {
            distributions.push({
              player_id: score.player_id,
              amount: cappedShare,
            });
            totalDistributed += cappedShare;
          }
        }

        // Create batch operation
        const { data: batchOp, error: batchError } = await supabase
          .from("batch_operations")
          .insert({
            operation_type: "weighted_distribution",
            event_id: eventId,
            created_by: user.id,
            metadata: {
              medal_id: total.medal_id,
              remaining_medals: remainingMedals,
              total_distributed: totalDistributed,
              player_count: distributions.length,
              max_per_player: maxPerPlayer,
            },
          })
          .select()
          .single();

        if (batchError) throw batchError;

        // Insert ledger transactions for weighted distribution
        const ledgerEntries = distributions.map(dist => ({
          player_id: dist.player_id,
          medal_id: total.medal_id,
          amount: dist.amount,
          transaction_type: "weighted_distribution",
          event_id: eventId,
          description: "Score-based distribution (50% pot, 10% cap)",
          created_by: user.id,
          batch_operation_id: batchOp.id,
        }));

        const { error: ledgerError } = await supabase
          .from("ledger_transactions")
          .insert(ledgerEntries);

        if (ledgerError) throw ledgerError;

        // Update event_totals with distributed amount (increment)
        const newDistributedAmount = alreadyDistributed + totalDistributed;
        await supabase
          .from("event_totals")
          .update({ 
            distributed_amount: newDistributedAmount,
          })
          .eq("id", total.id);

        toast.success(`Distributed ${totalDistributed.toLocaleString()} medals to ${distributions.length} players`);
      }

      setShowDialog(false);
    } catch (error: any) {
      toast.error("Failed to distribute: " + error.message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <>
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Weighted Distribution (50% of Pot)</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Distributes remaining medals (after raffle) to ALL qualified players based on their scores.
              Each player is capped at 10% of the remaining pot. Goes to ledger. Raffle winners are included.
            </p>
          </div>
          <Button onClick={() => setShowDialog(true)} className="w-full">
            <Calculator className="h-4 w-4 mr-2" />
            Run Weighted Distribution
          </Button>
        </div>
      </Card>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Weighted Distribution?</AlertDialogTitle>
            <AlertDialogDescription>
              This will distribute the remaining medals (after raffle) to ALL qualified players
              based on their scores, with a 10% cap per player. Raffle winners ARE included in this
              distribution. These amounts will be added to the ledger and affect player balances.
              <br /><br />
              Make sure the raffle has been completed first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDistribute} disabled={loading}>
              {loading ? "Distributing..." : "Distribute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default WeightedDistribution;
