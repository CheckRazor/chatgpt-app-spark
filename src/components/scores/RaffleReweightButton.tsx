import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RaffleReweightButtonProps {
  eventId: string;
  eventName: string;
  canManage: boolean;
}

const RaffleReweightButton = ({ eventId, eventName, canManage }: RaffleReweightButtonProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const recalculateRaffleWeights = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get event totals for min score threshold
      const { data: eventTotals } = await supabase
        .from('event_totals')
        .select('min_score_for_raffle')
        .eq('event_id', eventId)
        .single();

      const minScore = eventTotals?.min_score_for_raffle || 0;

      // Get all scores for this event
      const { data: scores } = await supabase
        .from('scores')
        .select('player_id, raw_score, players!inner(is_alt)')
        .eq('event_id', eventId);

      if (!scores || scores.length === 0) {
        toast.error("No scores found for this event");
        return;
      }

      // Get raffles for this event first
      const { data: raffles } = await supabase
        .from('raffles')
        .select('id')
        .eq('event_id', eventId);

      const raffleIds = raffles?.map(r => r.id) || [];

      // Get previous raffle entries to identify winners
      const { data: previousWinners } = raffleIds.length > 0 
        ? await supabase
            .from('raffle_entries')
            .select('player_id')
            .eq('is_winner', true)
            .in('raffle_id', raffleIds)
        : { data: [] };

      const winnerIds = new Set(previousWinners?.map(w => w.player_id) || []);

      // Calculate new weights
      const updates: any[] = [];
      const historyRecords: any[] = [];

      for (const score of scores) {
        // Skip alts
        if ((score.players as any).is_alt) continue;

        // Check eligibility
        const isEligible = (score.raw_score || 0) >= minScore;
        if (!isEligible) continue;

        // Get current weight
        const { data: currentWeight } = await supabase
          .from('raffle_weights')
          .select('entries_next')
          .eq('player_id', score.player_id)
          .eq('event_id', eventId)
          .maybeSingle();

        const entriesBefore = currentWeight?.entries_next || 1;
        let entriesAfter: number;

        if (winnerIds.has(score.player_id)) {
          // Winners reset to 1
          entriesAfter = 1;
        } else {
          // Eligible non-winners increment
          entriesAfter = entriesBefore + 1;
        }

        updates.push({
          player_id: score.player_id,
          event_id: eventId,
          entries_next: entriesAfter,
          entries_before: entriesBefore,
          updated_by: user.id,
        });

        historyRecords.push({
          player_id: score.player_id,
          event_id: eventId,
          entries_before: entriesBefore,
          entries_after: entriesAfter,
          reason: winnerIds.has(score.player_id) 
            ? 'Winner - Reset to 1' 
            : 'Eligible - Incremented',
          created_by: user.id,
        });
      }

      // Create batch operation
      const { data: batchOp, error: batchError } = await supabase
        .from('batch_operations')
        .insert({
          operation_type: 'raffle_reweight',
          event_id: eventId,
          created_by: user.id,
          metadata: { updated_count: updates.length },
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Upsert weights
      if (updates.length > 0) {
        const { error: weightsError } = await supabase
          .from('raffle_weights')
          .upsert(updates, { onConflict: 'player_id,event_id' });

        if (weightsError) throw weightsError;

        // Insert history
        const { error: historyError } = await supabase
          .from('raffle_entries_history')
          .insert(historyRecords);

        if (historyError) throw historyError;
      }

      toast.success(`🏆 Raffle weights updated for ${updates.length} players`);
      setShowDialog(false);
    } catch (error: any) {
      toast.error("Failed to recalculate raffle weights: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) return null;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setShowDialog(true)}
        disabled={loading}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Recalculate Raffle Weights
      </Button>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Recalculate Raffle Weights?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Recalculate raffle weights for {eventName}? This will overwrite entries_next values based on current scores and winner status. This action can be rolled back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={recalculateRaffleWeights} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {loading ? 'Processing...' : 'Recalculate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RaffleReweightButton;
