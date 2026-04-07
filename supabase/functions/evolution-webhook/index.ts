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
      .select('ai_agent_id, remote_jid')
      .eq('id', contactId)
      .single()

    if (contactError || !contact) {
      console.error(
        `[AI Handler] Exiting: Contact not found or error loading (contactId: ${contactId}). Error:`,
        contactError,
      )
      return
    }

    // REQUIREMENT: AI Agent must be explicitly assigned to the contact. Disabled by default.
    if (!contact.ai_agent_id) {
      console.log(
        `[AI Handler] Exiting: AI agent is disabled by default for contact ${contactId}. No ai_agent_id assigned.`,
      )
      return
    }

    console.log(
      `[AI Handler] Contact has agent assigned: ${contact.ai_agent_id}. Checking if active...`,
    )
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', contact.ai_agent_id)
      .eq('is_active', true)
      .single()

    if (agentError || !agent) {
      console.log(
        `[AI Handler] Exiting: Assigned agent ${contact.ai_agent_id} is either inactive, deleted, or error loading.`,
      )
      return
    }

    console.log(
      `[AI Handler] Agent selected: ${agent.id} (Name: "${agent.name}", is_active: ${agent.is_active})`,
    )

    const apiKey = agent.gemini_api_key || Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      console.error(
        `[AI Handler] Exiting: GEMINI_API_KEY missing from agent and environment secrets.`,
      )
      return
    }

    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('text, from_me')
      .eq('contact_id', contactId)
      .order('timestamp', { ascending: false })
      .limit(12)

    if (!messages || messages.length === 0) {
      console.log(
        `[AI Handler] Exiting: No messages found for contact ${contactId} (remote_jid: ${contact.remote_jid}).`,
      )
      return
    }

    console.log(`[AI Handler] Retrieved ${messages.length} messages for context.`)

    const history = messages
      .reverse()
      .map((m) => `${m.from_me ? 'Me' : 'Contact'}: ${m.text}`)
      .join('\n')

    const prompt = `
System Instructions:
${agent.system_prompt}

You are acting as "Me" in the following conversation.
Read the conversation history carefully.
Respond ONLY with the exact text of your next reply. Do not use quotes, explanations, or the prefix "Me:".

CONVERSATION HISTORY:
${history}
`

    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    console.log(`[AI Handler] Calling Gemini API at v1/models/gemini-2.5-flash...`)

    const aiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error(
        `[AI Handler] Exiting: Gemini API error for contact ${contactId} (remote_jid: ${contact.remote_jid}): Status ${aiRes.status} - Details:`,
        errText,
      )
      return
    }

    const aiData = await aiRes.json()
    const responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!responseText) {
      console.error(
        `[AI Handler] Exiting: Empty response from Gemini API for contact ${contactId}. Raw response:`,
        JSON.stringify(aiData),
      )
      return
    }

    console.log(`[AI Handler] Gemini generated text: "${responseText}"`)

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!integration || !integration.instance_name) {
      console.error(
        `[AI Handler] Exiting: Missing integration details or instance_name for user ${userId}.`,
      )
      return
    }

    const evoUrl = (
      integration.evolution_api_url ||
      Deno.env.get('EVOLUTION_API_URL') ||
      ''
    ).replace(/\/$/, '')
    const evoKey = integration.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY')

    console.log(
      `[AI Handler] Attempting to send message to Evolution API. Phone: ${contact.remote_jid}`,
    )

    const sendRes = await fetch(`${evoUrl}/message/sendText/${integration.instance_name}`, {
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

    if (!sendRes.ok) {
      const errText = await sendRes.text()
      console.error(
        `[AI Handler] Exiting: Failed to send message via Evolution API. HTTP Response: ${sendRes.status} Error:`,
        errText,
      )
      return
    }

    const result = await sendRes.json()
    const messageId = result?.key?.id || result?.id || crypto.randomUUID()

    await supabase.from('whatsapp_messages').upsert(
      {
        user_id: userId,
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

    console.log(`[AI Handler] Successfully auto-responded to contact ${contactId} and saved to DB.`)
  } catch (error) {
    console.error('[AI Handler] Unhandled exception in processAiResponse:', error)
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
      if (digits.length >= 8) {
        return digits
      }
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

    // Feature: Webhook Ingress Logging
    console.log('[WEBHOOK] INGRESS PAYLOAD:', JSON.stringify(payload))

    const instanceName = payload.instance
    const event = payload.event?.toLowerCase()

    if (!instanceName) {
      console.log('[WEBHOOK] Ignored: No instance provided in payload')
      return new Response('No instance provided', { status: 200 })
    }

    console.log(`[WEBHOOK] Processing event: ${event} for instance: ${instanceName}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: integ } = await supabase
      .from('user_integrations')
      .select('id, user_id')
      .eq('instance_name', instanceName)
      .single()
    if (!integ) {
      console.log(`[WEBHOOK] Ignored: Integration not found for instance: ${instanceName}`)
      return new Response('Integration not found', { status: 200 })
    }
    const userId = integ.user_id

    if (event === 'connection.update') {
      const state = payload.data?.state
      if (state === 'open') {
        console.log(`[WEBHOOK] Instance ${instanceName} connected.`)
        await supabase
          .from('user_integrations')
          .update({ status: 'CONNECTED' })
          .eq('user_id', userId)
      } else if (state === 'close') {
        console.log(`[WEBHOOK] Instance ${instanceName} disconnected.`)
        await supabase
          .from('user_integrations')
          .update({ status: 'DISCONNECTED' })
          .eq('user_id', userId)
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (event === 'messages.upsert') {
      let msgObj = payload.data

      if (Array.isArray(msgObj)) {
        msgObj = msgObj[0]
      } else if (msgObj && Array.isArray(msgObj.messages)) {
        msgObj = msgObj.messages[0]
      }

      if (msgObj && !msgObj.key && msgObj.message && msgObj.message.key) {
        msgObj = msgObj.message
      }

      if (!msgObj) {
        console.log('[WEBHOOK] Ignored: No valid message object found in payload.')
        return new Response('No message data', { status: 200 })
      }

      const key = msgObj.key || {}
      const remoteJid = key.remoteJid || msgObj.remoteJid || msgObj.jid
      const messageId = key.id || msgObj.id
      const fromMe = key.fromMe !== undefined ? key.fromMe : msgObj.fromMe || false

      if (!remoteJid) {
        console.log(
          `[WEBHOOK] Ignored: No remoteJid found in message data (instance: ${instanceName})`,
        )
        return new Response('Ignored - No remoteJid', { status: 200 })
      }

      if (remoteJid === 'status@broadcast' || remoteJid.includes('@g.us')) {
        console.log(
          `[WEBHOOK] Ignored: Message from Broadcast or Group (remoteJid: ${remoteJid}, instance: ${instanceName})`,
        )
        return new Response('Ignored - Broadcast/Group', { status: 200 })
      }

      if (!messageId) {
        console.log(
          `[WEBHOOK] Ignored: No messageId found for remoteJid ${remoteJid} (instance: ${instanceName})`,
        )
        return new Response('Ignored - No messageId', { status: 200 })
      }

      const pushName = msgObj.pushName || msgObj.verifiedName || msgObj.name || 'Unknown'
      const canonicalPhone = extractCanonicalPhone({ remoteJid, ...msgObj, ...key })

      let type = 'text'
      let text = '[Media/Unsupported]'

      const content = msgObj.message
      if (typeof content === 'string') {
        text = content
      } else if (content && typeof content === 'object') {
        text =
          content.conversation ||
          content.extendedTextMessage?.text ||
          content.imageMessage?.caption ||
          content.videoMessage?.caption ||
          content.documentMessage?.caption ||
          msgObj.text ||
          '[Media/Unsupported]'

        type = Object.keys(content).filter((k: string) => k !== 'messageContextInfo')[0] || 'text'
      } else if (msgObj.text) {
        text = msgObj.text
      }

      const ts = msgObj.messageTimestamp || msgObj.timestamp
      let timestamp = new Date().toISOString()
      if (ts) {
        const numTs = typeof ts === 'string' ? parseInt(ts, 10) : ts
        if (numTs > 0) {
          timestamp = new Date(numTs < 100000000000 ? numTs * 1000 : numTs).toISOString()
        }
      }

      let identity = null
      if (canonicalPhone) {
        const { data } = await supabase
          .from('contact_identity')
          .select('*')
          .eq('instance_id', integ.id)
          .eq('canonical_phone', canonicalPhone)
          .maybeSingle()
        identity = data
      }

      if (!identity && remoteJid) {
        const { data } = await supabase
          .from('contact_identity')
          .select('*')
          .eq('instance_id', integ.id)
          .or(`lid_jid.eq.${remoteJid},phone_jid.eq.${remoteJid}`)
          .limit(1)
          .maybeSingle()
        identity = data
      }

      if (!identity && canonicalPhone) {
        const phoneJid = remoteJid.includes('@s.whatsapp.net')
          ? remoteJid
          : `${canonicalPhone}@s.whatsapp.net`
        const lidJid = remoteJid.includes('@lid') ? remoteJid : null
        const { data: newId } = await supabase
          .from('contact_identity')
          .insert({
            instance_id: integ.id,
            user_id: userId,
            canonical_phone: canonicalPhone,
            phone_jid: phoneJid,
            lid_jid: lidJid,
            display_name: pushName,
          })
          .select()
          .single()
        identity = newId
      } else if (identity) {
        const updates: any = {}
        if (remoteJid.includes('@lid') && identity.lid_jid !== remoteJid)
          updates.lid_jid = remoteJid
        if (remoteJid.includes('@s.whatsapp.net') && identity.phone_jid !== remoteJid)
          updates.phone_jid = remoteJid
        if (Object.keys(updates).length > 0) {
          await supabase.from('contact_identity').update(updates).eq('id', identity.id)
        }
      }

      const effectivePhone = identity?.canonical_phone || canonicalPhone
      const effectiveJid =
        identity?.phone_jid || (effectivePhone ? `${effectivePhone}@s.whatsapp.net` : remoteJid)

      let { data: contact } = await supabase
        .from('whatsapp_contacts')
        .select('id, phone_number, push_name')
        .eq('user_id', userId)
        .eq('remote_jid', effectiveJid)
        .maybeSingle()

      if (!contact && effectivePhone) {
        const { data: contactByPhone } = await supabase
          .from('whatsapp_contacts')
          .select('id, phone_number, push_name')
          .eq('user_id', userId)
          .eq('phone_number', effectivePhone)
          .limit(1)
          .maybeSingle()
        if (contactByPhone) contact = contactByPhone
      }

      if (!contact && remoteJid !== effectiveJid) {
        const { data: contactByJid } = await supabase
          .from('whatsapp_contacts')
          .select('id, phone_number, push_name')
          .eq('user_id', userId)
          .eq('remote_jid', remoteJid)
          .limit(1)
          .maybeSingle()
        if (contactByJid) contact = contactByJid
      }

      if (!contact) {
        const { data: defaultAgent } = await supabase
          .from('ai_agents')
          .select('id')
          .eq('user_id', userId)
          .eq('is_default', true)
          .eq('is_active', true)
          .maybeSingle()

        const { data: newContact } = await supabase
          .from('whatsapp_contacts')
          .insert({
            user_id: userId,
            remote_jid: effectiveJid,
            phone_number: effectivePhone,
            push_name: pushName,
            last_message_at: timestamp,
            pipeline_stage: 'Em Conversa',
            ai_agent_id: defaultAgent?.id || null,
          })
          .select('id, phone_number, push_name')
          .single()
        contact = newContact
      } else {
        const updatePayload: any = { last_message_at: timestamp, pipeline_stage: 'Em Conversa' }
        if (
          pushName &&
          pushName !== 'Unknown' &&
          (!contact.push_name || contact.push_name === 'Unknown' || /^\d+$/.test(contact.push_name))
        ) {
          updatePayload.push_name = pushName
        }
        if (effectivePhone && !contact.phone_number) {
          updatePayload.phone_number = effectivePhone
        }
        if (Object.keys(updatePayload).length > 0) {
          await supabase.from('whatsapp_contacts').update(updatePayload).eq('id', contact.id)
        }
      }

      if (contact && messageId) {
        const { error: insertError } = await supabase.from('whatsapp_messages').upsert(
          {
            user_id: userId,
            contact_id: contact.id,
            message_id: messageId,
            from_me: fromMe,
            text: text,
            type: type,
            timestamp: timestamp,
            raw: msgObj,
          },
          { onConflict: 'user_id,message_id' },
        )

        if (insertError) {
          console.error(`[WEBHOOK] Error inserting message ${messageId}:`, insertError)
        } else {
          console.log(
            `[WEBHOOK] Successfully saved message ${messageId} for contact ${contact.id} (remoteJid: ${effectiveJid})`,
          )

          if (fromMe) {
            console.log(
              `[WEBHOOK] Skip AI processing: Message is from me (remoteJid: ${effectiveJid}, instance: ${instanceName})`,
            )
          } else if (!['text', 'conversation', 'extendedTextMessage'].includes(type)) {
            console.log(
              `[WEBHOOK] Skip AI processing: Message type is not text/conversation (type: ${type}, remoteJid: ${effectiveJid}, instance: ${instanceName})`,
            )
          } else {
            console.log(
              `[WEBHOOK] Triggering background AI task for contact ${contact.id} (remoteJid: ${effectiveJid})`,
            )
            if (
              typeof (globalThis as any).EdgeRuntime !== 'undefined' &&
              typeof (globalThis as any).EdgeRuntime.waitUntil === 'function'
            ) {
              ;(globalThis as any).EdgeRuntime.waitUntil(
                processAiResponse(userId, contact.id, supabaseUrl, supabaseKey),
              )
            } else {
              processAiResponse(userId, contact.id, supabaseUrl, supabaseKey).catch((err: any) =>
                console.error('[WEBHOOK] Background AI task failed:', err),
              )
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[WEBHOOK] Critical Webhook error:', error)
    return new Response('Webhook Error', { status: 500 })
  }
})
