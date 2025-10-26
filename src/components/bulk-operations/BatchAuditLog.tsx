import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { Undo2, Loader2 } from "lucide-react";
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

interface BatchOperation {
  id: string;
  operation_type: string;
  client_ref: string | null;
  status: string;
  metadata: any;
  created_at: string;
  rolled_back_at: string | null;
}

const BatchAuditLog = () => {
  const queryClient = useQueryClient();

  const { data: operations, isLoading } = useQuery({
    queryKey: ["batch_operations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_operations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as BatchOperation[];
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get the batch operation
      const { data: batch, error: batchError } = await supabase
        .from("batch_operations")
        .select("*")
        .eq("id", batchId)
        .single();

      if (batchError) throw batchError;
      if (batch.status === "rolled_back") {
        throw new Error("This operation has already been rolled back");
      }

      // Rollback ledger transactions
      const { data: transactions, error: transError } = await supabase
        .from("ledger_transactions")
        .select("*")
        .eq("batch_operation_id", batchId);

      if (transError) throw transError;

      if (transactions && transactions.length > 0) {
        // Create reverse transactions
        const reverseTransactions = transactions.map(t => ({
          player_id: t.player_id,
          medal_id: t.medal_id,
          amount: -t.amount,
          transaction_type: "rollback",
          description: `Rollback of ${t.description}`,
          created_by: user.id,
          batch_operation_id: batchId,
        }));

        const { error: insertError } = await supabase
          .from("ledger_transactions")
          .insert(reverseTransactions);

        if (insertError) throw insertError;
      }

      // Mark batch as rolled back
      const { error: updateError } = await supabase
        .from("batch_operations")
        .update({
          status: "rolled_back",
          rolled_back_at: new Date().toISOString(),
          rolled_back_by: user.id,
        })
        .eq("id", batchId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch_operations"] });
      queryClient.invalidateQueries({ queryKey: ["ledger_transactions"] });
      toast.success("Operation rolled back successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to rollback: ${error.message}`);
    },
  });

  if (isLoading) {
    return <div className="text-center">Loading audit log...</div>;
  }

  if (!operations || operations.length === 0) {
    return (
      <div className="text-center text-muted-foreground">
        No batch operations found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {operations.map((op) => (
        <Card key={op.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={op.status === "rolled_back" ? "secondary" : "default"}>
                    {op.operation_type.replace("_", " ").toUpperCase()}
                  </Badge>
                  {op.status === "rolled_back" && (
                    <Badge variant="destructive">Rolled Back</Badge>
                  )}
                  {op.client_ref && (
                    <Badge variant="outline">{op.client_ref}</Badge>
                  )}
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <div>
                    Created: {format(new Date(op.created_at), "PPpp")}
                  </div>
                  {op.rolled_back_at && (
                    <div>
                      Rolled back: {format(new Date(op.rolled_back_at), "PPpp")}
                    </div>
                  )}
                </div>

                {op.metadata && (
                  <div className="text-sm">
                    {op.metadata.player_count && (
                      <span className="text-muted-foreground">
                        Players: {op.metadata.player_count}
                      </span>
                    )}
                    {op.metadata.amount && (
                      <span className="ml-3 text-muted-foreground">
                        Amount: {op.metadata.amount}
                      </span>
                    )}
                    {op.metadata.description && (
                      <div className="mt-1 text-muted-foreground">
                        {op.metadata.description}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {op.status === "completed" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={rollbackMutation.isPending}
                    >
                      {rollbackMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Undo2 className="mr-2 h-4 w-4" />
                          Rollback
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rollback Operation</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will reverse all transactions in this batch. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => rollbackMutation.mutate(op.id)}
                      >
                        Rollback
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default BatchAuditLog;
