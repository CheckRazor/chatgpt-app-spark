-- Create ocr_rows table for detailed OCR parsing
CREATE TABLE IF NOT EXISTS public.ocr_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.ocr_uploads(id) ON DELETE CASCADE,
  parsed_name TEXT NOT NULL,
  parsed_score INTEGER NOT NULL,
  raw_text TEXT,
  corrected_value INTEGER,
  confidence DECIMAL(5,4) DEFAULT 0.0,
  linked_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  image_source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create raffle_weights table
CREATE TABLE IF NOT EXISTS public.raffle_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  entries_next INTEGER DEFAULT 1,
  entries_before INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(player_id, event_id)
);

-- Create raffle_entries_history table
CREATE TABLE IF NOT EXISTS public.raffle_entries_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  entries_before INTEGER NOT NULL,
  entries_after INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create admin_settings table
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Add min_score_for_raffle to event_totals if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'event_totals' 
    AND column_name = 'min_score_for_raffle'
  ) THEN
    ALTER TABLE public.event_totals ADD COLUMN min_score_for_raffle INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add raw_score to scores table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scores' 
    AND column_name = 'raw_score'
  ) THEN
    ALTER TABLE public.scores ADD COLUMN raw_score INTEGER;
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.ocr_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_entries_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for ocr_rows
CREATE POLICY "Everyone can view ocr_rows"
  ON public.ocr_rows FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can manage ocr_rows"
  ON public.ocr_rows FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'leader'::app_role));

-- RLS policies for raffle_weights
CREATE POLICY "Everyone can view raffle_weights"
  ON public.raffle_weights FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can manage raffle_weights"
  ON public.raffle_weights FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'leader'::app_role));

-- RLS policies for raffle_entries_history
CREATE POLICY "Everyone can view raffle_entries_history"
  ON public.raffle_entries_history FOR SELECT
  USING (true);

CREATE POLICY "Admins and leaders can create raffle_entries_history"
  ON public.raffle_entries_history FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'leader'::app_role));

-- RLS policies for admin_settings
CREATE POLICY "Everyone can view admin_settings"
  ON public.admin_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage admin_settings"
  ON public.admin_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_ocr_rows_updated_at
  BEFORE UPDATE ON public.ocr_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_raffle_weights_updated_at
  BEFORE UPDATE ON public.raffle_weights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default admin settings
INSERT INTO public.admin_settings (key, value) 
VALUES ('auto_correct_numeric_ocr', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;