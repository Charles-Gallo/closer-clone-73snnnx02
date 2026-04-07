CREATE OR REPLACE FUNCTION public.apply_default_agent_to_unassigned()
RETURNS trigger AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE public.whatsapp_contacts
        SET ai_agent_id = NEW.id
        WHERE user_id = NEW.user_id AND ai_agent_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS apply_default_agent_trigger ON public.ai_agents;
CREATE TRIGGER apply_default_agent_trigger
AFTER INSERT OR UPDATE OF is_default ON public.ai_agents
FOR EACH ROW
EXECUTE FUNCTION public.apply_default_agent_to_unassigned();

DO $$
BEGIN
  UPDATE public.whatsapp_contacts c
  SET ai_agent_id = a.id
  FROM public.ai_agents a
  WHERE c.user_id = a.user_id
    AND a.is_default = true
    AND a.is_active = true
    AND c.ai_agent_id IS NULL;
END $$;
