// ============ Shared Auth Utilities for Deno Deploy ============
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getEnv(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing environment variable: ${key}`)
  return val
}

export function getSupabase() {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function verifyPinToken(token: string): Promise<string> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('pin_sessions')
    .select('athlete_id, locked_until')
    .eq('pin_hash', token)
    .single()
  if (error || !data) {
    const e = new Error('Invalid PIN token')
    ;(e as any).status = 401
    throw e
  }
  if (data.locked_until && new Date(data.locked_until) > new Date()) {
    const e = new Error('Account locked. Try again later.')
    ;(e as any).status = 423
    throw e
  }
  return data.athlete_id
}

export function getIntervalIcuHeaders(): Record<string, string> {
  const apiKey = getEnv('INTERVAL_ICU_API_KEY')
  const basic = btoa(`API_KEY:${apiKey}`)
  return {
    'Authorization': `Basic ${basic}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

export function getDeepSeekHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getEnv('DEEPSEEK_API_KEY')}`,
    'Content-Type': 'application/json',
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-pin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}