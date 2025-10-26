-- Create batch operations table for audit logging
CREATE TABLE public.batch_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type TEXT NOT NULL, -- 'bulk_deduction', 'raffle_draw', 'player_merge', 'score_import'
  client_ref TEXT,
  event_id UUID REFERENCES public.events(id),
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'rolled_back'
  metadata JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  rolled_back_by UUID
);

-- Enable RLS
ALTER TABLE public.batch_operations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Everyone can view batch operations"
  ON public.batch_operations
  FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can create batch operations"
  ON public.batch_operations
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'leader'::app_role));

CREATE POLICY "Admins and leaders can update batch operations"
  ON public.batch_operations
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'leader'::app_role));

-- Add batch_operation_id to ledger_transactions
ALTER TABLE public.ledger_transactions 
ADD COLUMN batch_operation_id UUID REFERENCES public.batch_operations(id);

-- Add batch_operation_id to raffle_entries
ALTER TABLE public.raffle_entries 
ADD COLUMN batch_operation_id UUID REFERENCES public.batch_operations(id);

-- Create trigger for batch_operations
CREATE TRIGGER update_batch_operations_updated_at
  BEFORE UPDATE ON public.batch_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();