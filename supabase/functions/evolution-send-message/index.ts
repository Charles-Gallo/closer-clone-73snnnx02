import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from 'cors'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    const { contactId, text } = await req.json()
    if (!contactId || !text) throw new Error('Missing contactId or text')

    // Get User Profile to find Customer ID
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('customer_id')
      .eq('id', user.id)
      .single()

    const customerId = profile?.customer_id

    let customer = null
    if (customerId) {
      const { data: c } = await supabaseClient
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single()
      customer = c
    }

    // Usage Tracking Check
    if (customer && customer.message_limit) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { count } = await supabaseClient
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        .eq('from_me', true)
        .gte('timestamp', startOfMonth.toISOString())

      if (count && count >= customer.message_limit) {
        throw new Error('Message limit exceeded for this billing cycle')
      }
    }

    const { data: integration } = await supabaseClient
      .from('user_integrations')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    const evoUrlRaw =
      customer?.evolution_api_url ||
      integration?.evolution_api_url ||
      Deno.env.get('EVOLUTION_API_URL')
    const evoKey =
      customer?.evolution_api_key ||
      integration?.evolution_api_key ||
      Deno.env.get('EVOLUTION_API_KEY')
    const instanceName = customer?.evolution_instance_name || integration?.instance_name

    if (!instanceName) {
      throw new Error('Integration not found or not connected')
    }

    const evoUrl = evoUrlRaw ? evoUrlRaw.replace(/\/$/, '') : ''

    const { data: contact } = await supabaseClient
      .from('whatsapp_contacts')
      .select('remote_jid, customer_id')
      .eq('id', contactId)
      .single()

    if (!contact || !contact.remote_jid) throw new Error('Contact not found')

    const response = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        apikey: evoKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: contact.remote_jid,
        text: text,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Evolution API error: ${errText}`)
    }

    const result = await response.json()
    const messageId = result?.key?.id || result?.id || crypto.randomUUID()
    const timestamp = new Date().toISOString()

    // Optimistically save the message
    await supabaseClient.from('whatsapp_messages').upsert(
      {
        user_id: user.id,
        customer_id: customerId,
        contact_id: contactId,
        message_id: messageId,
        from_me: true,
        text: text,
        type: 'text',
        timestamp: timestamp,
        raw: result,
      },
      { onConflict: 'user_id,message_id' },
    )

    // Update contact pipeline stage
    await supabaseClient
      .from('whatsapp_contacts')
      .update({
        pipeline_stage: 'Em Conversa',
        last_message_at: timestamp,
      })
      .eq('id', contactId)

    return new Response(JSON.stringify({ success: true, messageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
