-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "tenant_customers_policy" ON public.customers;
DROP POLICY IF EXISTS "tenant_profiles_policy" ON public.profiles;
DROP POLICY IF EXISTS "tenant_contacts_policy" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "tenant_messages_policy" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "tenant_integrations_policy" ON public.user_integrations;
DROP POLICY IF EXISTS "tenant_agents_policy" ON public.ai_agents;

-- Customers Policy
CREATE POLICY "tenant_customers_policy" ON public.customers
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agency'
    OR id = (SELECT customer_id FROM public.profiles WHERE id = auth.uid())
  );

-- Profiles Policy
CREATE POLICY "tenant_profiles_policy" ON public.profiles
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agency'
    OR customer_id = (SELECT customer_id FROM public.profiles WHERE id = auth.uid())
    OR id = auth.uid()
  );

-- Contacts Policy
CREATE POLICY "tenant_contacts_policy" ON public.whatsapp_contacts
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agency'
    OR customer_id = (SELECT customer_id FROM public.profiles WHERE id = auth.uid())
  );

-- Messages Policy
CREATE POLICY "tenant_messages_policy" ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agency'
    OR customer_id = (SELECT customer_id FROM public.profiles WHERE id = auth.uid())
  );

-- User Integrations Policy
CREATE POLICY "tenant_integrations_policy" ON public.user_integrations
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agency'
    OR customer_id = (SELECT customer_id FROM public.profiles WHERE id = auth.uid())
  );

-- AI Agents Policy
CREATE POLICY "tenant_agents_policy" ON public.ai_agents
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agency'
    OR customer_id = (SELECT customer_id FROM public.profiles WHERE id = auth.uid())
  );

-- Seed Agency User
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'cdalgallo@gmail.com') THEN
    v_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'cdalgallo@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')), NOW(),
      NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"name": "Admin da Agência"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (v_user_id, 'cdalgallo@gmail.com', 'Admin da Agência', 'agency')
    ON CONFLICT (id) DO UPDATE SET role = 'agency';
  ELSE
    -- Ensure the role is agency for the existing user
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'cdalgallo@gmail.com';
    UPDATE public.profiles SET role = 'agency' WHERE id = v_user_id;
  END IF;
END $$;
