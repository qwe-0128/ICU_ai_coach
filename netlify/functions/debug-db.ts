// ============ Database Debug Netlify Function ============
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

    // Check what data exists for this athlete
    const [trainingCount, trainingAll, weeklyCount, profileExists] = await Promise.all([
      sb.from('training_summaries').select('count', { count: 'exact', head: true }).eq('athlete_id', athleteId),
      sb.from('training_summaries').select('id,date,type,name,tss,athlete_id').eq('athlete_id', athleteId).order('date', { ascending: false }).limit(20),
      sb.from('weekly_summaries').select('count', { count: 'exact', head: true }).eq('athlete_id', athleteId),
      sb.from('athlete_profiles').select('athlete_id,ftp,weight,max_hr').eq('athlete_id', athleteId).single(),
    ])

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        athlete_id_used: athleteId,
        training_count: trainingCount.count || 0,
        weekly_count: weeklyCount.count || 0,
        profile: profileExists.data || null,
        profile_error: profileExists.error ? (profileExists.error.message || JSON.stringify(profileExists.error)) : null,
        recent_trainings: trainingAll.data || [],
        note: '如果 training_count=0 但之前同步成功，说明实际 athlete_id 不匹配，需要重置数据',
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