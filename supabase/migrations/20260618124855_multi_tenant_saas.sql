-- Multi-Tenant SaaS Update

DO $$
BEGIN
  CREATE TYPE public.user_role AS ENUM ('agency', 'admin', 'sdr');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    sdr_limit INTEGER DEFAULT 3,
    message_limit INTEGER DEFAULT 1000,
    evolution_api_url TEXT,
    evolution_api_key TEXT,
    evolution_instance_name TEXT,
    llm_provider TEXT DEFAULT 'gemini',
    llm_api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role public.user_role NOT NULL DEFAULT 'sdr',
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.contact_identity ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

-- Provide default customer for legacy data
DO $$
DECLARE
  default_customer_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_contacts WHERE customer_id IS NULL LIMIT 1) THEN
    INSERT INTO public.customers (name, status) VALUES ('Legacy Customer', 'active') RETURNING id INTO default_customer_id;
    
    UPDATE public.user_integrations SET customer_id = default_customer_id WHERE customer_id IS NULL;
    UPDATE public.whatsapp_contacts SET customer_id = default_customer_id WHERE customer_id IS NULL;
    UPDATE public.whatsapp_messages SET customer_id = default_customer_id WHERE customer_id IS NULL;
    UPDATE public.ai_agents SET customer_id = default_customer_id WHERE customer_id IS NULL;
    UPDATE public.import_jobs SET customer_id = default_customer_id WHERE customer_id IS NULL;
    UPDATE public.contact_identity SET customer_id = default_customer_id WHERE customer_id IS NULL;
    
    INSERT INTO public.profiles (id, email, role, customer_id)
    SELECT id, email, 'admin', default_customer_id FROM auth.users
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'sdr')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed Agency User
DO $$
DECLARE
  agency_user_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'cdalgallo@gmail.com') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      agency_user_id, '00000000-0000-0000-0000-000000000000', 'cdalgallo@gmail.com', crypt('Skip@Pass', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"name": "Agency Admin"}', false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );
    
    INSERT INTO public.profiles (id, email, role, customer_id)
    VALUES (agency_user_id, 'cdalgallo@gmail.com', 'agency', NULL)
    ON CONFLICT (id) DO UPDATE SET role = 'agency', customer_id = NULL;
  END IF;
END $$;

-- RLS Setup
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_customer_id()
RETURNS UUID AS $$
  SELECT customer_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency can manage all customers" ON public.customers;
CREATE POLICY "Agency can manage all customers" ON public.customers
  FOR ALL TO authenticated USING (public.get_user_role() = 'agency');

DROP POLICY IF EXISTS "Admins can view their own customer" ON public.customers;
CREATE POLICY "Admins can view their own customer" ON public.customers
  FOR SELECT TO authenticated USING (id = public.get_user_customer_id());

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.get_user_role() = 'agency' OR customer_id = public.get_user_customer_id());

DROP POLICY IF EXISTS "Agency profiles access" ON public.profiles;
CREATE POLICY "Agency profiles access" ON public.profiles
  FOR ALL TO authenticated USING (public.get_user_role() = 'agency');

-- Drop old policies to replace with multi-tenant
DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.whatsapp_contacts;
CREATE POLICY "Tenant contacts access" ON public.whatsapp_contacts
  FOR ALL TO authenticated USING (
    public.get_user_role() = 'agency' OR 
    (customer_id = public.get_user_customer_id() AND public.get_user_customer_id() IS NOT NULL) OR
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can manage their own messages" ON public.whatsapp_messages;
CREATE POLICY "Tenant messages access" ON public.whatsapp_messages
  FOR ALL TO authenticated USING (
    public.get_user_role() = 'agency' OR 
    (customer_id = public.get_user_customer_id() AND public.get_user_customer_id() IS NOT NULL) OR
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can manage their own integrations" ON public.user_integrations;
CREATE POLICY "Tenant integrations access" ON public.user_integrations
  FOR ALL TO authenticated USING (
    public.get_user_role() = 'agency' OR 
    (customer_id = public.get_user_customer_id() AND public.get_user_customer_id() IS NOT NULL) OR
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can manage their own AI agents" ON public.ai_agents;
CREATE POLICY "Tenant ai_agents access" ON public.ai_agents
  FOR ALL TO authenticated USING (
    public.get_user_role() = 'agency' OR 
    (customer_id = public.get_user_customer_id() AND public.get_user_customer_id() IS NOT NULL) OR
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can manage their own import jobs" ON public.import_jobs;
CREATE POLICY "Tenant import_jobs access" ON public.import_jobs
  FOR ALL TO authenticated USING (
    public.get_user_role() = 'agency' OR 
    (customer_id = public.get_user_customer_id() AND public.get_user_customer_id() IS NOT NULL) OR
    user_id = auth.uid()
  );
