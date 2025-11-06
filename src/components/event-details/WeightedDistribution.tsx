import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calculator } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface WeightedDistributionProps {
  eventId: string;
  canManage: boolean;
}

const WeightedDistribution = ({ eventId, canManage }: WeightedDistributionProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch event totals for summary display
  const { data: eventTotals } = useQuery({
    queryKey: ['event-totals-summary', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_totals')
        .select('medal_id, total_amount, raffle_amount_used, distributed_amount, medals(name)')
        .eq('event_id', eventId);
      
      if (error) throw error;
      return data;
    },
  });

  const handleDistribute = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get event totals to process each medal type
      const { data: eventTotals } = await supabase
        .from("event_totals")
        .select("medal_id, total_amount, raffle_amount_used, distributed_amount")
        .eq("event_id", eventId);

      if (!eventTotals || eventTotals.length === 0) {
        throw new Error("No event totals configured");
      }

      // Process each medal type using server-side RPC v2 (alt→main aggregation + full reallocation)
      for (const total of eventTotals) {
        // Guard against undefined IDs
        if (!eventId || !total.medal_id || !user.id) {
          toast.error("Missing required parameters for distribution");
          continue;
        }

        const { data: result, error } = await supabase.rpc(
          'run_weighted_distribution_v2',
          {
            event_uuid: eventId,
            medal_uuid: total.medal_id,
            actor: user.id
          }
        );

        if (error) {
          // Surface the RPC error message
          throw new Error(error.message || "RPC call failed");
        }
        if (!result) continue;

        const resultObj = result as any;

        if (resultObj.status === 'noop') {
          if (resultObj.reason === 'no_remaining') {
            toast.info(`No remaining medals to distribute for this event/medal.`);
          } else if (resultObj.reason === 'no_scores') {
            toast.info(`No qualified players with scores for weighted distribution.`);
          }
          continue;
        }

        if (resultObj.status === 'ok') {
          toast.success(
            `Distributed ${Number(resultObj.distributed_now).toLocaleString()} medals to ${resultObj.players} players. ` +
            `Remaining pot: ${Number(resultObj.remaining_after).toLocaleString()}.`
          );
        }
      }

      setShowDialog(false);
    } catch (error: any) {
      toast.error("Failed to distribute: " + (error.message || "Unknown error"));
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

          {eventTotals && eventTotals.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
              <div className="font-medium mb-1">Current Status:</div>
              {eventTotals.map((total: any) => {
                const raffleUsed = Number(total.raffle_amount_used || 0);
                const distributed = Number(total.distributed_amount || 0);
                const remaining = Number(total.total_amount) - raffleUsed - distributed;
                
                return (
                  <div key={total.medal_id} className="pl-2">
                    <div className="font-medium">{total.medals?.name || 'Unknown Medal'}:</div>
                    <div className="pl-2">
                      Raffle used: {raffleUsed.toLocaleString()} • 
                      Distributed: {distributed.toLocaleString()} • 
                      Remaining: {remaining.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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
