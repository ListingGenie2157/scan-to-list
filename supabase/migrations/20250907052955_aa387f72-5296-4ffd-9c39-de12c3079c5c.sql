-- Create auto listing settings table
CREATE TABLE public.auto_listing_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  daily_limit INTEGER NOT NULL DEFAULT 10,
  schedule_time TIME NOT NULL DEFAULT '09:00:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auto_listing_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own auto listing settings" 
ON public.auto_listing_settings 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create listing drafts table
CREATE TABLE public.listing_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  listing_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  listed_at TIMESTAMP WITH TIME ZONE,
  ebay_listing_id TEXT,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'listed', 'failed'))
);

-- Enable RLS
ALTER TABLE public.listing_drafts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own listing drafts" 
ON public.listing_drafts 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_auto_listing_settings_user_id ON public.auto_listing_settings(user_id);
CREATE INDEX idx_listing_drafts_user_id ON public.listing_drafts(user_id);
CREATE INDEX idx_listing_drafts_status ON public.listing_drafts(status);
CREATE INDEX idx_listing_drafts_created_at ON public.listing_drafts(created_at);

-- Create trigger for updating updated_at
CREATE TRIGGER update_auto_listing_settings_updated_at
BEFORE UPDATE ON public.auto_listing_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();