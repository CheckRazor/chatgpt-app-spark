import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface Player {
  canonical_name: string;
}

interface Medal {
  name: string;
  color: string | null;
}

interface Transaction {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
  players?: Player;
  medals?: Medal;
}

interface LedgerViewProps {
  eventId: string;
}

const LedgerView = ({ eventId }: LedgerViewProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, [eventId]);

  const fetchTransactions = async () => {
    try {
      const { data } = await supabase
        .from("ledger_transactions")
        .select("*, players(canonical_name), medals(name, color)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (data) setTransactions(data);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading transactions...</div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No transactions recorded for this event yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Player</TableHead>
          <TableHead>Medal</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell>{format(new Date(tx.created_at), "PPp")}</TableCell>
            <TableCell className="font-medium">{tx.players?.canonical_name}</TableCell>
            <TableCell>
              <span
                className="px-2 py-1 rounded text-sm font-medium"
                style={{
                  backgroundColor: tx.medals?.color || "#gray",
                  color: "#000",
                }}
              >
                {tx.medals?.name}
              </span>
            </TableCell>
            <TableCell className={tx.amount > 0 ? "text-green-600" : "text-red-600"}>
              {tx.amount > 0 ? "+" : ""}{tx.amount}
            </TableCell>
            <TableCell className="capitalize">{tx.transaction_type.replace("_", " ")}</TableCell>
            <TableCell className="text-muted-foreground">
              {tx.description || "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default LedgerView;
