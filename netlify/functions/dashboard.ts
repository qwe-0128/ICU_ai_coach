// ============ Dashboard Data Netlify Function ============
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
    const sb = getSupabase()

    // Count all data first for diagnostics
    const { count: totalCount } = await sb
      .from('training_summaries')
      .select('count', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)

    // Parallel fetch all data - use wider date ranges
    const [profileResult, recentResult, weeklyResult, goalsResult, lastSyncResult] = await Promise.all([
      sb.from('athlete_profiles').select('*').eq('athlete_id', athleteId).single(),
      sb.from('training_summaries')
        .select('*').eq('athlete_id', athleteId)
        .gte('date', new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date', { ascending: false }),
      sb.from('weekly_summaries')
        .select('*').eq('athlete_id', athleteId)
        .gte('week_start', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('week_start', { ascending: true }),
      sb.from('athlete_goals').select('*').eq('athlete_id', athleteId).eq('status', 'active'),
      sb.from('training_summaries')
        .select('date').eq('athlete_id', athleteId)
        .order('date', { ascending: false }).limit(1),
    ])

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        total_count: totalCount || 0,
        profile: profileResult.data || {},
        recent_42d: recentResult.data || [],
        weekly_90d: weeklyResult.data || [],
        goals: goalsResult.data || [],
        last_sync: lastSyncResult.data?.[0]?.date || '',
        debug: {
          athlete_id: athleteId,
          profile_exists: !!profileResult.data,
          profile_error: profileResult.error ? (profileResult.error.message || JSON.stringify(profileResult.error)) : null,
          training_total_in_db: totalCount || 0,
          training_returned: recentResult.data?.length || 0,
          weekly_returned: weeklyResult.data?.length || 0,
          training_error: recentResult.error ? (recentResult.error.message || JSON.stringify(recentResult.error)) : null,
        },
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