// ============ Memory Stats Netlify Function ============
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { getSupabase, verifyPinToken, corsHeaders } from './utils/auth'

const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  try {
    const token = event.headers['x-pin-token']
    if (!token) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'PIN required' }) }
    }
    const athleteId = await verifyPinToken(token)

    const body = JSON.parse(event.body || '{}')
    const { action, session_id } = body
    const sb = getSupabase()

    if (action === 'clear_session' && session_id) {
      await sb.from('chat_memories')
        .delete()
        .eq('session_id', session_id)
        .eq('athlete_id', athleteId)

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ success: true }),
      }
    }

    // Default: return stats
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    
    const [shortTermResult, longTermResult, sessionsResult, goalsResult] = await Promise.all([
      sb.from('chat_memories')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .gte('created_at', fourteenDaysAgo),
      sb.from('chat_memories')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId),
      sb.from('chat_memories')
        .select('session_id')
        .eq('athlete_id', athleteId)
        .limit(100),
      sb.from('athlete_goals')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .eq('status', 'active'),
    ])

    // Count distinct sessions
    const sessionIds = new Set<string>()
    if (sessionsResult.data) {
      for (const row of sessionsResult.data) {
        sessionIds.add(row.session_id)
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        short_term_days: 14,
        long_term_entries: longTermResult.count || 0,
        chat_sessions: sessionIds.size,
        goals_count: goalsResult.count || 0,
      }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: message }),
    }
  }
}

export { handler }