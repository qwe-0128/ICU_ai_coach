// ============ AI Chat Netlify Function ============
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { getSupabase, getEnv, verifyPinToken, corsHeaders, getDeepSeekHeaders } from './utils/auth'
import { buildSystemPrompt } from './utils/preprocess'

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
    const { message, session_id: inputSessionId } = body
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Message required' }) }
    }

    const sb = getSupabase()
    const today = new Date().toISOString().split('T')[0]
    const sessionId = inputSessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    // ============ 1. Retrieve Profile ============
    const { data: profileRow } = await sb
      .from('cycling_profiles')
      .select('*')
      .eq('athlete_id', athleteId)
      .single()

    // ============ 2. Retrieve Recent 14d Activities ============
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: recentActivities } = await sb
      .from('training_summaries')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('date', fourteenDaysAgo)
      .order('date', { ascending: false })

    // ============ 3. Retrieve Weekly 42d Summaries ============
    const fortyTwoDaysAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: weeklyData } = await sb
      .from('weekly_summaries')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('week_start', fortyTwoDaysAgo)
      .order('week_start', { ascending: true })

    // ============ 4. Retrieve Goals ============
    const { data: goals } = await sb
      .from('athlete_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')

    // ============ 5. Retrieve Chat Memories (latest 5 from recent sessions) ============
    const { data: chatMemories } = await sb
      .from('chat_memories')
      .select('content, created_at')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(10)

    // ============ 6. Retrieve Recent Chat History for this session ============
    const { data: sessionHistory } = await sb
      .from('chat_memories')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(20)

    // ============ 7. Build System Prompt ============
    const systemPrompt = buildSystemPrompt(
      {
        ftp: profileRow?.ftp || 200,
        weight: profileRow?.weight || 70,
        maxHR: profileRow?.max_hr || 190,
        restHR: profileRow?.rest_hr || 55,
        hrZones: profileRow?.hr_zones || [],
        powerZones: profileRow?.power_zones || [],
        vo2max: profileRow?.vo2max || null,
      },
      (recentActivities || []).map(a => ({
        date: a.date, type: a.type, name: a.name,
        duration_sec: a.duration_sec, distance_m: a.distance_m,
        tss: a.tss, if_: a.if_, np: a.np,
        avg_hr: a.avg_hr, max_hr: a.max_hr,
        avg_power: a.avg_power, max_power: a.max_power,
        hr_zone_dist: a.hr_zone_dist || {},
        power_zone_dist: a.power_zone_dist || {},
        fatigue: a.fatigue, form: a.form, fitness: a.fitness,
        injury_flags: a.injury_flags || [],
        notes: a.notes || '', raw_id: a.raw_activity_id || '',
      })),
      (weeklyData || []).map(w => ({
        week_start: w.week_start, week_end: w.week_end,
        total_tss: w.total_tss, avg_if: w.avg_if,
        total_duration_sec: w.total_duration_sec, total_distance_m: w.total_distance_m,
        activity_count: w.activity_count,
        avg_fatigue: w.avg_fatigue, avg_form: w.avg_form, avg_fitness: w.avg_fitness,
      })),
      (goals || []).map(g => ({
        type: g.type, target: g.target, unit: g.unit,
        deadline: g.deadline, status: g.status,
      })),
      (chatMemories || []).map(m => ({
        content: m.content,
        created_at: m.created_at,
      })),
      today
    )

    // ============ 8. Build Messages ============
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    // Add session history (last 10 exchanges)
    if (sessionHistory && sessionHistory.length > 0) {
      for (const h of sessionHistory.slice(-20)) {
        messages.push({ role: h.role, content: h.content })
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: message.trim() })

    // ============ 9. Call DeepSeek API ============
    const headers = getDeepSeekHeaders()
    const dsResp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false,
      }),
    })

    if (!dsResp.ok) {
      const err = await dsResp.text()
      console.error('DeepSeek error:', err)
      throw new Error(`DeepSeek API error: ${dsResp.status}`)
    }

    const dsData = await dsResp.json()
    const reply = dsData.choices?.[0]?.message?.content || '（AI 未生成回复，请重试）'
    const tokensUsed = dsData.usage?.total_tokens || 0

    // ============ 10. Save to Chat Memories ============
    // Save user message
    await sb.from('chat_memories').insert({
      athlete_id: athleteId,
      session_id: sessionId,
      role: 'user',
      content: message.trim(),
      metadata: {},
      created_at: new Date().toISOString(),
    })

    // Save assistant reply
    await sb.from('chat_memories').insert({
      athlete_id: athleteId,
      session_id: sessionId,
      role: 'assistant',
      content: reply,
      metadata: { tokens_used: tokensUsed },
      created_at: new Date().toISOString(),
    })

    // ============ 11. Return ============
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        reply,
        session_id: sessionId,
        tokens_used: tokensUsed,
        memories_retrieved: (chatMemories || []).length,
      }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('Chat error:', message)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: message }),
    }
  }
}

export { handler }