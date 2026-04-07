-- Add is_default column to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Create function to ensure single default per user
CREATE OR REPLACE FUNCTION public.ensure_single_default_agent()
RETURNS trigger AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE public.ai_agents
        SET is_default = false
        WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and create it
DROP TRIGGER IF EXISTS ensure_single_default_agent_trigger ON public.ai_agents;
CREATE TRIGGER ensure_single_default_agent_trigger
BEFORE INSERT OR UPDATE OF is_default ON public.ai_agents
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_default_agent();
