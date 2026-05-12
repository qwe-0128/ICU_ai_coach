// ============ PIN Authentication Netlify Function ============
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { getSupabase, getEnv, corsHeaders } from './utils/auth'
import { createHash, randomBytes } from 'crypto'

function hashPin(pin: string): string {
  return createHash('sha256').update(pin + getEnv('SESSION_SECRET')).digest('hex')
}

const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { action, pin } = body

    const sb = getSupabase()
    const athleteId = getEnv('INTERVAL_ICU_ATHLETE_ID')

    if (action === 'set') {
      if (!pin || pin.length < 4 || pin.length > 8) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'PIN must be 4-8 digits' }),
        }
      }

      const pinHash = hashPin(pin)

      // Check existing session first
      const { data: existing } = await sb
        .from('pin_sessions')
        .select('id')
        .eq('athlete_id', athleteId)
        .maybeSingle()

      let error: { message: string } | null = null

      if (existing) {
        // Update existing
        const res = await sb.from('pin_sessions').update({
          pin_hash: pinHash,
          attempts: 0,
          locked_until: null,
          last_access: new Date().toISOString(),
        }).eq('athlete_id', athleteId)
        error = res.error
      } else {
        // Insert new
        const res = await sb.from('pin_sessions').insert({
          athlete_id: athleteId,
          pin_hash: pinHash,
          attempts: 0,
          locked_until: null,
          last_access: new Date().toISOString(),
        })
        error = res.error
      }

      if (error) throw error

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ success: true }),
      }
    }

    if (action === 'verify') {
      if (!pin) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'PIN required' }),
        }
      }

      // Get current session
      const { data: session, error: fetchErr } = await sb
        .from('pin_sessions')
        .select('*')
        .eq('athlete_id', athleteId)
        .single()

      if (fetchErr) {
        console.error('Supabase fetch error:', JSON.stringify(fetchErr))
        throw new Error(`Database error: ${fetchErr.message || JSON.stringify(fetchErr)}`)
      }
      
      if (!session) {
        // First time - accept any PIN
        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify({ success: true, first_time: true }),
        }
      }

      // Check if locked
      if (session.locked_until && new Date(session.locked_until) > new Date()) {
        const remaining = Math.ceil((new Date(session.locked_until).getTime() - Date.now()) / 60000)
        return {
          statusCode: 429,
          headers: corsHeaders(),
          body: JSON.stringify({ error: `Account locked. Try again in ${remaining} minutes.` }),
        }
      }

      const pinHash = hashPin(pin)
      if (pinHash === session.pin_hash) {
        // Reset attempts on success
        await sb.from('pin_sessions').update({
          attempts: 0,
          locked_until: null,
          last_access: new Date().toISOString(),
        }).eq('athlete_id', athleteId)

        // Return a session token (re-use pin_hash as token)
        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify({ success: true, token: session.pin_hash }),
        }
      }

      // Failed attempt
      const newAttempts = (session.attempts || 0) + 1
      let lockedUntil: string | null = null

      if (newAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      }

      await sb.from('pin_sessions').update({
        attempts: newAttempts,
        locked_until: lockedUntil,
      }).eq('athlete_id', athleteId)

      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({
          error: `Invalid PIN. ${5 - newAttempts} attempts remaining.`,
          attempts_left: 5 - newAttempts,
        }),
      }
    }

    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid action' }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : `Unknown error: ${JSON.stringify(err)}`
    console.error('PIN auth error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: message }),
    }
  }
}

export { handler }