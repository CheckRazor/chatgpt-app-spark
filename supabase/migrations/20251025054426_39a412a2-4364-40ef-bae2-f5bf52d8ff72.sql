-- Create medals table
CREATE TABLE public.medals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  value INTEGER NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create event_totals table
CREATE TABLE public.event_totals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  medal_id UUID NOT NULL REFERENCES public.medals(id) ON DELETE CASCADE,
  total_amount INTEGER NOT NULL,
  distributed_amount INTEGER NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, medal_id)
);

-- Create raffles table
CREATE TABLE public.raffles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  medal_id UUID NOT NULL REFERENCES public.medals(id) ON DELETE CASCADE,
  total_prizes INTEGER NOT NULL,
  weight_formula TEXT NOT NULL DEFAULT 'score',
  status TEXT NOT NULL DEFAULT 'pending',
  drawn_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create raffle_entries table
CREATE TABLE public.raffle_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL DEFAULT 1,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  prize_amount INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(raffle_id, player_id)
);

-- Create ledger_transactions table
CREATE TABLE public.ledger_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  medal_id UUID NOT NULL REFERENCES public.medals(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  raffle_id UUID REFERENCES public.raffles(id) ON DELETE SET NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for medals
CREATE POLICY "Everyone can view medals"
  ON public.medals FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage medals"
  ON public.medals FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for event_totals
CREATE POLICY "Everyone can view event totals"
  ON public.event_totals FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can create event totals"
  ON public.event_totals FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'leader'::app_role)
  );

CREATE POLICY "Admins and leaders can update event totals"
  ON public.event_totals FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'leader'::app_role)
  );

-- RLS Policies for raffles
CREATE POLICY "Everyone can view raffles"
  ON public.raffles FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can create raffles"
  ON public.raffles FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'leader'::app_role)
  );

CREATE POLICY "Admins and leaders can update raffles"
  ON public.raffles FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'leader'::app_role)
  );

-- RLS Policies for raffle_entries
CREATE POLICY "Everyone can view raffle entries"
  ON public.raffle_entries FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can manage entries"
  ON public.raffle_entries FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'leader'::app_role)
  );

-- RLS Policies for ledger_transactions
CREATE POLICY "Everyone can view ledger transactions"
  ON public.ledger_transactions FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can create transactions"
  ON public.ledger_transactions FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'leader'::app_role)
  );

-- Triggers
CREATE TRIGGER update_medals_updated_at
  BEFORE UPDATE ON public.medals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_event_totals_updated_at
  BEFORE UPDATE ON public.event_totals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_raffles_updated_at
  BEFORE UPDATE ON public.raffles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_raffle_entries_updated_at
  BEFORE UPDATE ON public.raffle_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default medals
INSERT INTO public.medals (name, value, color, icon) VALUES
  ('Gold', 100, '#FFD700', 'trophy'),
  ('Silver', 50, '#C0C0C0', 'medal'),
  ('Bronze', 25, '#CD7F32', 'award');