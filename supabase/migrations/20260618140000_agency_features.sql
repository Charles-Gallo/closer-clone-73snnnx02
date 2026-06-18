-- Ensure columns exist
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sdr_limit INTEGER DEFAULT 3;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS message_limit INTEGER DEFAULT 1000;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS evolution_api_url TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS evolution_api_key TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'gemini';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS llm_api_key TEXT;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.create_customer_with_admin(
  p_customer_name TEXT,
  p_admin_email TEXT,
  p_admin_name TEXT,
  p_admin_password TEXT,
  p_sdr_limit INTEGER,
  p_message_limit INTEGER,
  p_evo_url TEXT,
  p_evo_key TEXT,
  p_evo_instance TEXT,
  p_llm_provider TEXT,
  p_llm_key TEXT,
  p_initial_prompt TEXT
) RETURNS UUID AS $$
DECLARE
  v_customer_id UUID;
  v_admin_id UUID;
  v_role public.user_role;
BEGIN
  -- Verify caller is agency
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'agency' THEN
    RAISE EXCEPTION 'Access denied. Must be agency.';
  END IF;

  -- Create customer
  INSERT INTO public.customers (
    name, sdr_limit, message_limit, evolution_api_url, evolution_api_key, evolution_instance_name, llm_provider, llm_api_key, status
  ) VALUES (
    p_customer_name, p_sdr_limit, p_message_limit, p_evo_url, p_evo_key, p_evo_instance, p_llm_provider, p_llm_key, 'active'
  ) RETURNING id INTO v_customer_id;

  -- Create admin user
  v_admin_id := gen_random_uuid();
  
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, role, aud,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_token_current,
    phone, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_admin_id, '00000000-0000-0000-0000-000000000000', p_admin_email,
    crypt(p_admin_password, gen_salt('bf')), NOW(), NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}',
    json_build_object('name', p_admin_name),
    false, 'authenticated', 'authenticated',
    '', '', '', '', '', NULL, '', '', ''
  );

  -- Update auto-generated profile
  UPDATE public.profiles
  SET role = 'admin', customer_id = v_customer_id, full_name = p_admin_name
  WHERE id = v_admin_id;

  -- Create default AI agent
  IF p_initial_prompt IS NOT NULL AND p_initial_prompt != '' THEN
    INSERT INTO public.ai_agents (
      user_id, customer_id, name, description, system_prompt, gemini_api_key, is_active, is_default
    ) VALUES (
      v_admin_id, v_customer_id, 'Agente Principal (' || p_customer_name || ')', 'Agente padrão para a empresa', p_initial_prompt, COALESCE(p_llm_key, ''), true, true
    );
  END IF;

  RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_customers_with_usage(p_month_start TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  name TEXT,
  status TEXT,
  sdr_limit INTEGER,
  message_limit INTEGER,
  evolution_instance_name TEXT,
  messages_used BIGINT,
  active_sdrs BIGINT
) AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- Verify caller is agency
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'agency' THEN
    RAISE EXCEPTION 'Access denied. Must be agency.';
  END IF;

  RETURN QUERY
  SELECT 
    c.id, c.name, c.status, c.sdr_limit, c.message_limit, c.evolution_instance_name,
    (SELECT COUNT(*) FROM public.whatsapp_messages wm WHERE wm.customer_id = c.id AND wm.timestamp >= p_month_start) AS messages_used,
    (SELECT COUNT(*) FROM public.profiles p WHERE p.customer_id = c.id AND p.role = 'sdr') AS active_sdrs
  FROM public.customers c;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_customer_status(p_customer_id UUID, p_status TEXT)
RETURNS void AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- Verify caller is agency
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'agency' THEN
    RAISE EXCEPTION 'Access denied. Must be agency.';
  END IF;

  UPDATE public.customers SET status = p_status WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
