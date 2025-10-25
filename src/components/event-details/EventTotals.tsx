import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

interface Medal {
  id: string;
  name: string;
  value: number;
  color: string | null;
}

interface EventTotal {
  id: string;
  medal_id: string;
  total_amount: number;
  distributed_amount: number;
  verified: boolean;
  medals?: Medal;
}

interface EventTotalsProps {
  eventId: string;
  canManage: boolean;
}

const EventTotals = ({ eventId, canManage }: EventTotalsProps) => {
  const [medals, setMedals] = useState<Medal[]>([]);
  const [totals, setTotals] = useState<EventTotal[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchMedals();
    fetchTotals();
  }, [eventId]);

  const fetchMedals = async () => {
    const { data } = await supabase
      .from("medals")
      .select("*")
      .order("value", { ascending: false });
    if (data) setMedals(data);
  };

  const fetchTotals = async () => {
    const { data } = await supabase
      .from("event_totals")
      .select("*, medals(*)")
      .eq("event_id", eventId);
    if (data) setTotals(data);
  };

  const handleAmountChange = (medalId: string, value: string) => {
    setAmounts({ ...amounts, [medalId]: parseInt(value) || 0 });
  };

  const handleSave = async (medalId: string) => {
    if (!canManage) return;

    const amount = amounts[medalId];
    if (!amount) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const existing = totals.find(t => t.medal_id === medalId);

      if (existing) {
        const { error } = await supabase
          .from("event_totals")
          .update({ total_amount: amount })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("event_totals")
          .insert([{
            event_id: eventId,
            medal_id: medalId,
            total_amount: amount,
            created_by: user.id,
          }]);
        if (error) throw error;
      }

      toast.success("Total saved successfully");
      fetchTotals();
      setAmounts({ ...amounts, [medalId]: 0 });
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    }
  };

  const handleVerify = async (totalId: string) => {
    if (!canManage) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("event_totals")
        .update({
          verified: true,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        })
        .eq("id", totalId);

      if (error) throw error;
      toast.success("Total verified");
      fetchTotals();
    } catch (error: any) {
      toast.error("Failed to verify: " + error.message);
    }
  };

  if (!canManage && totals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No totals have been set for this event yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Set Event Totals</h3>
          <div className="grid gap-4">
            {medals.map((medal) => {
              const existing = totals.find(t => t.medal_id === medal.id);
              return (
                <div key={medal.id} className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label htmlFor={`medal-${medal.id}`}>
                      {medal.name} Medals (Value: {medal.value})
                    </Label>
                    <Input
                      id={`medal-${medal.id}`}
                      type="number"
                      placeholder={existing ? `Current: ${existing.total_amount}` : "Enter amount"}
                      value={amounts[medal.id] || ""}
                      onChange={(e) => handleAmountChange(medal.id, e.target.value)}
                    />
                  </div>
                  <Button onClick={() => handleSave(medal.id)}>
                    Save
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {totals.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medal Type</TableHead>
              <TableHead>Total Amount</TableHead>
              <TableHead>Distributed</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.map((total) => (
              <TableRow key={total.id}>
                <TableCell className="font-medium">
                  {total.medals?.name}
                </TableCell>
                <TableCell>{total.total_amount}</TableCell>
                <TableCell>{total.distributed_amount}</TableCell>
                <TableCell>
                  {total.total_amount - total.distributed_amount}
                </TableCell>
                <TableCell className="text-right">
                  {total.verified ? (
                    <span className="text-green-600 flex items-center justify-end gap-1">
                      <Check className="h-4 w-4" />
                      Verified
                    </span>
                  ) : canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVerify(total.id)}
                    >
                      Verify
                    </Button>
                  ) : (
                    <span className="text-muted-foreground flex items-center justify-end gap-1">
                      <X className="h-4 w-4" />
                      Unverified
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default EventTotals;
