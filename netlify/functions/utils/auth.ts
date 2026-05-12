// ============ Shared Auth Utilities for Netlify Functions ============
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

export function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing environment variable: ${key}`)
  return val
}

export function getSupabase() {
  return createClient(getEnv('VITE_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
    global: { headers: { 'Content-Type': 'application/json' } },
    realtime: { transport: ws as any },
  })
}

export async function verifyPinToken(token: string): Promise<string> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('pin_sessions')
    .select('athlete_id, locked_until')
    .eq('pin_hash', token)
    .single()

  if (error || !data) throw new Error('Invalid PIN token')
  if (data.locked_until && new Date(data.locked_until) > new Date()) {
    throw new Error('Account locked. Try again later.')
  }
  return data.athlete_id
}

export function getIntervalIcuHeaders(): Record<string, string> {
  return {
    'Authorization': `Basic ${Buffer.from(`API_KEY:${getEnv('INTERVAL_ICU_API_KEY')}`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
}

export function getDeepSeekHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getEnv('DEEPSEEK_API_KEY')}`,
    'Content-Type': 'application/json',
  }
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-pin-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}