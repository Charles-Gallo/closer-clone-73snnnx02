import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

export async function processAiResponse(
  userId: string,
  contactId: string,
  supabaseUrl: string,
  supabaseKey: string,
) {
  console.log(
    `[AI Handler] Starting processAiResponse for userId: ${userId}, contactId: ${contactId}`,
  )
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('ai_agent_id, remote_jid, customer_id')
      .eq('id', contactId)
      .single()

    if (contactError || !contact) {
      console.error(
        `[AI Handler] Exiting: Contact not found or error loading (contactId: ${contactId}).`,
      )
      return
    }

    if (!contact.ai_agent_id) {
      console.log(
        `[AI Handler] Exiting: AI agent is disabled by default for contact ${contactId}. No ai_agent_id assigned.`,
      )
      return
    }

    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', contact.ai_agent_id)
      .eq('is_active', true)
      .single()

    if (agentError || !agent) {
      console.log(`[AI Handler] Exiting: Assigned agent ${contact.ai_agent_id} is inactive.`)
      return
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', contact.customer_id)
      .single()

    const apiKey = customer?.llm_api_key || agent.gemini_api_key || Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      console.error(`[AI Handler] Exiting: GEMINI_API_KEY missing.`)
      return
    }

    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('text, from_me')
      .eq('contact_id', contactId)
      .order('timestamp', { ascending: false })
      .limit(12)

    if (!messages || messages.length === 0) return

    const history = messages
      .reverse()
      .map((m) => `${m.from_me ? 'Me' : 'Contact'}: ${m.text}`)
      .join('\n')

    const prompt = `System Instructions:
${agent.system_prompt}

You are acting as "Me" in the following conversation.
Read the conversation history carefully.
Respond ONLY with the exact text of your next reply. Do not use quotes, explanations, or the prefix "Me:".

CONVERSATION HISTORY:
${history}`

    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`

    const aiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      }),
    })

    if (!aiRes.ok) return

    const aiData = await aiRes.json()
    const responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!responseText) return

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const evoUrl = (
      customer?.evolution_api_url ||
      integration?.evolution_api_url ||
      Deno.env.get('EVOLUTION_API_URL') ||
      ''
    ).replace(/\/$/, '')
    const evoKey = customer?.evolution_api_key || integration?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY')
    const instanceName = customer?.evolution_instance_name || integration?.instance_name

    if (!instanceName) return

    const sendRes = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        apikey: evoKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: contact.remote_jid,
        text: responseText,
      }),
    })

    if (!sendRes.ok) return

    const result = await sendRes.json()
    const messageId = result?.key?.id || result?.id || crypto.randomUUID()

    await supabase.from('whatsapp_messages').upsert(
      {
        user_id: userId,
        customer_id: contact.customer_id,
        contact_id: contactId,
        message_id: messageId,
        from_me: true,
        text: responseText,
        type: 'text',
        timestamp: new Date().toISOString(),
        raw: result,
      },
      { onConflict: 'user_id,message_id' },
    )

    await supabase
      .from('whatsapp_contacts')
      .update({
        pipeline_stage: 'Em Conversa',
        last_message_at: new Date().toISOString(),
      })
      .eq('id', contactId)

  } catch (error) {
    console.error('[AI Handler] Unhandled exception:', error)
  }
}

function extractCanonicalPhone(data: any): string | null {
  if (!data) return null
  const fields = ['phone', 'phoneNumber', 'wa_id', 'senderPn', 'id', 'remoteJid', 'jid']
  for (const field of fields) {
    const val = data[field]
    if (typeof val === 'string') {
      if (val.includes('@s.whatsapp.net')) {
        const extracted = val.split('@')[0]
        if (/^\d+$/.test(extracted)) return extracted
      }
      if (val.includes('@lid') || val.includes('@g.us') || val.includes('status@broadcast'))
        continue

      const digits = val.replace(/\D/g, '')
      if (digits.length >= 8) return digits
    } else if (typeof val === 'number') {
      const strVal = String(val)
      if (strVal.length >= 8) return strVal
    }
  }
  return null
}

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json()
    const instanceName = payload.instance
    const event = payload.event?.toLowerCase()

    if (!instanceName) return new Response('No instance', { status: 200 })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Resolve Customer and User
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('evolution_instance_name', instanceName)
      .maybeSingle()

    let customerId = customer?.id
    let userId = null

    if (!customerId) {
      const { data: integ } = await supabase
        .from('user_integrations')
        .select('id, user_id, customer_id')
        .eq('instance_name', instanceName)
        .maybeSingle()
        
      if (integ) {
        userId = integ.user_id
        customerId = integ.customer_id
      }
    } else {
      const { data: admin } = await supabase
        .from('profiles')
        .select('id')
        .eq('customer_id', customerId)
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle()
      userId = admin?.id
    }

    if (!userId) {
      console.log(`[WEBHOOK] Ignored: No mapping for instance: ${instanceName}`)
      return new Response('No mapping found', { status: 200 })
    }

    if (event === 'connection.update') {
      const state = payload.data?.state
      if (state === 'open' || state === 'close') {
        const status = state === 'open' ? 'CONNECTED' : 'DISCONNECTED'
        if (customerId) {
            await supabase.from('user_integrations').update({ status }).eq('customer_id', customerId)
        } else {
            await supabase.from('user_integrations').update({ status }).eq('user_id', userId)
        }
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

    if (event === 'messages.upsert') {
      let msgObj = payload.data
      if (Array.isArray(msgObj)) msgObj = msgObj[0]
      else if (msgObj && Array.isArray(msgObj.messages)) msgObj = msgObj.messages[0]
      if (msgObj && !msgObj.key && msgObj.message && msgObj.message.key) msgObj = msgObj.message

      if (!msgObj) return new Response('No data', { status: 200 })

      const key = msgObj.key || {}
      const remoteJid = key.remoteJid || msgObj.remoteJid || msgObj.jid
      const messageId = key.id || msgObj.id
      const fromMe = key.fromMe !== undefined ? key.fromMe : msgObj.fromMe || false

      if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.includes('@g.us') || !messageId) {
        return new Response('Ignored', { status: 200 })
      }

      const pushName = msgObj.pushName || msgObj.verifiedName || msgObj.name || 'Unknown'
      const canonicalPhone = extractCanonicalPhone({ remoteJid, ...msgObj, ...key })
      const effectivePhone = canonicalPhone
      const effectiveJid = canonicalPhone ? `${canonicalPhone}@s.whatsapp.net` : remoteJid

      let type = 'text'
      let text = '[Media/Unsupported]'
      const content = msgObj.message
      if (typeof content === 'string') text = content
      else if (content && typeof content === 'object') {
        text = content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption || content.videoMessage?.caption || msgObj.text || text
        type = Object.keys(content).filter(k => k !== 'messageContextInfo')[0] || 'text'
      } else if (msgObj.text) text = msgObj.text

      const ts = msgObj.messageTimestamp || msgObj.timestamp
      let timestamp = new Date().toISOString()
      if (ts) {
        const numTs = typeof ts === 'string' ? parseInt(ts, 10) : ts
        if (numTs > 0) timestamp = new Date(numTs < 100000000000 ? numTs * 1000 : numTs).toISOString()
      }

      let { data: contact } = await supabase
        .from('whatsapp_contacts')
        .select('id, phone_number, push_name')
        .eq('customer_id', customerId)
        .eq('remote_jid', effectiveJid)
        .maybeSingle()

      if (!contact) {
        const { data: defaultAgent } = await supabase
          .from('ai_agents')
          .select('id')
          .eq('customer_id', customerId)
          .eq('is_default', true)
          .eq('is_active', true)
          .maybeSingle()

        const { data: newContact } = await supabase
          .from('whatsapp_contacts')
          .insert({
            user_id: userId,
            customer_id: customerId,
            remote_jid: effectiveJid,
            phone_number: effectivePhone,
            push_name: pushName,
            last_message_at: timestamp,
            pipeline_stage: 'Em Conversa',
            ai_agent_id: defaultAgent?.id || null,
          })
          .select('id')
          .single()
        contact = newContact
      } else {
        await supabase.from('whatsapp_contacts').update({ last_message_at: timestamp, pipeline_stage: 'Em Conversa' }).eq('id', contact.id)
      }

      if (contact && messageId) {
        const { error: insertError } = await supabase.from('whatsapp_messages').upsert({
            user_id: userId,
            customer_id: customerId,
            contact_id: contact.id,
            message_id: messageId,
            from_me: fromMe,
            text: text,
            type: type,
            timestamp: timestamp,
            raw: msgObj,
        }, { onConflict: 'user_id,message_id' })

        if (!insertError && !fromMe && ['text', 'conversation', 'extendedTextMessage'].includes(type)) {
          if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && typeof (globalThis as any).EdgeRuntime.waitUntil === 'function') {
            (globalThis as any).EdgeRuntime.waitUntil(processAiResponse(userId, contact.id, supabaseUrl, supabaseKey))
          } else {
            processAiResponse(userId, contact.id, supabaseUrl, supabaseKey).catch(console.error)
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    console.error('[WEBHOOK] Critical error:', error)
    return new Response('Error', { status: 500 })
  }
})
