// ============ ICU AI Coach — Deno Deploy Server (Full Stack) ============
// @ts-nocheck
// 统一服务：静态前端 + API 路由，部署到 Deno Deploy 即可
import { getSupabase, getEnv, verifyPinToken, getIntervalIcuHeaders, getDeepSeekHeaders, corsHeaders, sha256 } from './auth.ts'
import { buildSystemPrompt, fetchActivities, fetchWellness, fetchProfile, preprocessActivity, preprocessProfile, computeWeeklySummaries } from './preprocess.ts'

// Resolve dist path relative to this module (works on Deno Deploy even if CWD ≠ project root)
const DIST_DIR = new URL('../dist/', import.meta.url).pathname

// ============ MIME Types ============
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

const CACHE_MAX_AGE: Record<string, string> = {
  '.js': 'public, max-age=31536000, immutable',
  '.css': 'public, max-age=31536000, immutable',
  '.svg': 'public, max-age=31536000, immutable',
  '.png': 'public, max-age=31536000, immutable',
  '.jpg': 'public, max-age=31536000, immutable',
  '.woff2': 'public, max-age=31536000, immutable',
}

// ============ Helpers ============
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function error(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function apiError(err: unknown): Response {
  const msg = err instanceof Error ? err.message : 'Internal error'
  const status = (err as any)?.status || 500
  return error(msg, status)
}

function getMime(path: string): string {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  return MIME[ext] || 'application/octet-stream'
}

// ============ Static File Server ============
async function serveStatic(pathname: string): Promise<Response | null> {
  // Security: prevent directory traversal
  if (pathname.includes('..') || pathname.includes('~')) return null

  let filePath = `${DIST_DIR}${pathname.replace(/^\//, '')}`
  const isRoot = pathname === '/' || pathname === ''

  // Try exact file first
  try {
    const data = await Deno.readFile(isRoot ? `${DIST_DIR}index.html` : filePath)
    const mime = isRoot ? 'text/html; charset=utf-8' : getMime(filePath)
    const cacheHeader = CACHE_MAX_AGE[filePath.substring(filePath.lastIndexOf('.'))] || 'public, max-age=0, must-revalidate'
    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Cache-Control': cacheHeader,
      ...corsHeaders,
    }
    return new Response(data, { status: 200, headers })
  } catch {
    // File not found, try SPA fallback
    try {
      const data = await Deno.readFile(`${DIST_DIR}index.html`)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', ...corsHeaders },
      })
    } catch {
      return null
    }
  }
}

// ============ PIN Auth ============
async function handlePinAuth(req: Request, body: any): Promise<Response> {
  const { action, pin } = body || {}
  const sb = getSupabase()
  const athleteId = getEnv('INTERVAL_ICU_ATHLETE_ID')

  // Validate existing token without PIN (used on page load)
  if (action === 'validate') {
    const token = req.headers.get('x-pin-token')
    if (!token) return error('PIN required', 401)
    try {
      await verifyPinToken(token)
      return json({ valid: true })
    } catch (e: unknown) {
      return apiError(e)
    }
  }

  if (action === 'set') {
    if (!pin || pin.length < 4 || pin.length > 8) return error('PIN must be 4-8 digits', 400)
    const pinHash = await sha256(pin + getEnv('SESSION_SECRET'))
    const { data: existing } = await sb.from('pin_sessions').select('id').eq('athlete_id', athleteId).maybeSingle()
    let dbError: any = null
    if (existing) {
      const r = await sb.from('pin_sessions').update({ pin_hash: pinHash, attempts: 0, locked_until: null, last_access: new Date().toISOString() }).eq('athlete_id', athleteId)
      dbError = r.error
    } else {
      const r = await sb.from('pin_sessions').insert({ athlete_id: athleteId, pin_hash: pinHash, attempts: 0, locked_until: null, last_access: new Date().toISOString() })
      dbError = r.error
    }
    if (dbError) throw dbError
    return json({ success: true, token: pinHash })
  }

  if (action === 'verify') {
    if (!pin) return error('PIN required', 400)
    const { data: session, error: fetchErr } = await sb.from('pin_sessions').select('*').eq('athlete_id', athleteId).single()
    if (fetchErr) throw new Error(`Database error: ${fetchErr.message || JSON.stringify(fetchErr)}`)
    if (!session) return json({ success: true, first_time: true })
    if (session.locked_until && new Date(session.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(session.locked_until).getTime() - Date.now()) / 60000)
      return error(`Account locked. Try again in ${remaining} minutes.`, 429)
    }
    const pinHash = await sha256(pin + getEnv('SESSION_SECRET'))
    if (pinHash === session.pin_hash) {
      await sb.from('pin_sessions').update({ attempts: 0, locked_until: null, last_access: new Date().toISOString() }).eq('athlete_id', athleteId)
      return json({ success: true, token: session.pin_hash })
    }
    const newAttempts = (session.attempts || 0) + 1
    let lockedUntil: string | null = null
    if (newAttempts >= 5) lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await sb.from('pin_sessions').update({ attempts: newAttempts, locked_until: lockedUntil }).eq('athlete_id', athleteId)
    return error(`Invalid PIN. ${5 - newAttempts} attempts remaining.`, 401)
  }

  return error('Invalid action', 400)
}

// ============ Chat ============
async function handleChat(athleteId: string, body: any): Promise<Response> {
  const { message, session_id: inputSessionId } = body || {}
  if (!message || typeof message !== 'string' || message.trim().length === 0) return error('Message required', 400)

  const sb = getSupabase()
  const today = new Date().toISOString().split('T')[0]
  const sessionId = inputSessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  const { data: profileRow } = await sb.from('athlete_profiles').select('*').eq('athlete_id', athleteId).single()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const { data: recentActivities } = await sb.from('training_summaries').select('*').eq('athlete_id', athleteId).gte('date', fourteenDaysAgo).order('date', { ascending: false })
  const fortyTwoDaysAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const { data: weeklyData } = await sb.from('weekly_summaries').select('*').eq('athlete_id', athleteId).gte('week_start', fortyTwoDaysAgo).order('week_start', { ascending: true })
  const { data: goals } = await sb.from('athlete_goals').select('*').eq('athlete_id', athleteId).eq('status', 'active')
  const { data: chatMemories } = await sb.from('chat_memories').select('content, created_at').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(10)
  const { data: sessionHistory } = await sb.from('chat_memories').select('role, content').eq('session_id', sessionId).order('created_at', { ascending: true }).limit(20)

  const systemPrompt = buildSystemPrompt(
    { ftp: profileRow?.ftp || 200, weight: profileRow?.weight || 70, maxHR: profileRow?.max_hr || 190, restHR: profileRow?.rest_hr || 55, hrZones: profileRow?.hr_zones || [], powerZones: profileRow?.power_zones || [], vo2max: profileRow?.vo2max || null },
    (recentActivities || []).map(a => ({ date: a.date, type: a.type, name: a.name, duration_sec: a.duration_sec, distance_m: a.distance_m, tss: a.tss, if_: a.if_, np: a.np, avg_hr: a.avg_hr, max_hr: a.max_hr, avg_power: a.avg_power, max_power: a.max_power, hr_zone_dist: a.hr_zone_dist || {}, power_zone_dist: a.power_zone_dist || {}, fatigue: a.fatigue, form: a.form, fitness: a.fitness, injury_flags: a.injury_flags || [], notes: a.notes || '', raw_id: a.raw_activity_id || '', data_source: a.data_source || 'unknown' })),
    (weeklyData || []).map(w => ({ week_start: w.week_start, week_end: w.week_end, total_tss: w.total_tss, avg_if: w.avg_if, total_duration_sec: w.total_duration_sec, total_distance_m: w.total_distance_m, activity_count: w.activity_count, avg_fatigue: w.avg_fatigue, avg_form: w.avg_form, avg_fitness: w.avg_fitness })),
    (goals || []).map(g => ({ type: g.type, target: g.target, unit: g.unit, deadline: g.deadline, status: g.status })),
    (chatMemories || []).map(m => ({ content: m.content, created_at: m.created_at })),
    today
  )

  const messages: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }]
  if (sessionHistory?.length > 0) {
    for (const h of sessionHistory.slice(-20)) messages.push({ role: h.role, content: h.content })
  }
  messages.push({ role: 'user', content: message.trim() })

  const dsHeaders = getDeepSeekHeaders()
  const dsResp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST', headers: dsHeaders,
    body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 2000, temperature: 0.7, stream: false }),
  })
  if (!dsResp.ok) { const err = await dsResp.text(); console.error('DeepSeek error:', err); throw new Error(`DeepSeek API error: ${dsResp.status}`) }
  const dsData = await dsResp.json()
  const reply = dsData.choices?.[0]?.message?.content || '（AI 未生成回复，请重试）'
  const tokensUsed = dsData.usage?.total_tokens || 0

  await sb.from('chat_memories').insert({ athlete_id: athleteId, session_id: sessionId, role: 'user', content: message.trim(), metadata: {}, created_at: new Date().toISOString() })
  await sb.from('chat_memories').insert({ athlete_id: athleteId, session_id: sessionId, role: 'assistant', content: reply, metadata: { tokens_used: tokensUsed }, created_at: new Date().toISOString() })

  return json({ reply, session_id: sessionId, tokens_used: tokensUsed, memories_retrieved: (chatMemories || []).length })
}

// ============ Dashboard ============
async function handleDashboard(athleteId: string): Promise<Response> {
  const sb = getSupabase()
  const { count: totalCount } = await sb.from('training_summaries').select('count', { count: 'exact', head: true }).eq('athlete_id', athleteId)
  const { count: stravaCount } = await sb.from('training_summaries').select('count', { count: 'exact', head: true }).eq('athlete_id', athleteId).eq('data_source', 'strava_empty')
  const [profileResult, recentResult, weeklyResult, goalsResult, lastSyncResult] = await Promise.all([
    sb.from('athlete_profiles').select('*').eq('athlete_id', athleteId).single(),
    sb.from('training_summaries').select('*').eq('athlete_id', athleteId).gte('date', new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('date', { ascending: false }),
    sb.from('weekly_summaries').select('*').eq('athlete_id', athleteId).gte('week_start', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('week_start', { ascending: true }),
    sb.from('athlete_goals').select('*').eq('athlete_id', athleteId).eq('status', 'active'),
    sb.from('training_summaries').select('date').eq('athlete_id', athleteId).order('date', { ascending: false }).limit(1),
  ])
  return json({
    total_count: totalCount || 0, strava_empty_count: stravaCount || 0, profile: profileResult.data || {}, recent_42d: recentResult.data || [],
    weekly_90d: weeklyResult.data || [], goals: goalsResult.data || [], last_sync: lastSyncResult.data?.[0]?.date || '',
  })
}

// ============ Data Sync ============
async function handleSyncData(athleteId: string, body: any): Promise<Response> {
  const { force_full } = body || {}
  const sb = getSupabase()
  const today = new Date().toISOString().split('T')[0]
  const diagnostics: string[] = []
  diagnostics.push(`athleteId=${athleteId}`, `today=${today}`)

  const rawProfile = await fetchProfile(athleteId)
  let startDate: string
  if (force_full) { startDate = '2020-01-01' } else {
    const { data: latest } = await sb.from('training_summaries').select('date').eq('athlete_id', athleteId).order('date', { ascending: false }).limit(1).single()
    if (latest) { const d = new Date(latest.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); startDate = d.toISOString().split('T')[0] }
    else { startDate = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }
  }
  diagnostics.push(`date_range=${startDate}~${today}`)

  const rawActivities = await fetchActivities(athleteId, startDate, today, diagnostics)

  const profile = preprocessProfile(rawProfile, rawActivities[0])
  await sb.from('athlete_profiles').upsert({ athlete_id: athleteId, ftp: profile.ftp, weight: profile.weight, max_hr: profile.maxHR, rest_hr: profile.restHR, hr_zones: profile.hrZones, power_zones: profile.powerZones, vo2max: profile.vo2max, updated_at: new Date().toISOString() }, { onConflict: 'athlete_id' })

  let newCount = 0
  for (const raw of rawActivities) {
    const preprocessed = preprocessActivity(raw, profile.ftp)
    if (!preprocessed.date) { diagnostics.push(`skipped_activity_no_date_id=${raw.id}`); continue }
    const { data: existing } = await sb.from('training_summaries').select('id').eq('raw_activity_id', preprocessed.raw_id).limit(1)
    if (existing?.length > 0) {
      await sb.from('training_summaries').update({
        date: preprocessed.date, type: preprocessed.type, name: preprocessed.name, duration_sec: preprocessed.duration_sec, distance_m: preprocessed.distance_m, tss: preprocessed.tss, if_: preprocessed.if_, np: preprocessed.np, avg_hr: preprocessed.avg_hr, max_hr: preprocessed.max_hr, avg_power: preprocessed.avg_power, max_power: preprocessed.max_power, hr_zone_dist: preprocessed.hr_zone_dist, power_zone_dist: preprocessed.power_zone_dist, fatigue: preprocessed.fatigue, form: preprocessed.form, fitness: preprocessed.fitness, injury_flags: preprocessed.injury_flags, notes: preprocessed.notes, data_source: preprocessed.data_source,
      }).eq('raw_activity_id', preprocessed.raw_id)
    } else {
      await sb.from('training_summaries').insert({
        athlete_id: athleteId, date: preprocessed.date, type: preprocessed.type, name: preprocessed.name, duration_sec: preprocessed.duration_sec, distance_m: preprocessed.distance_m, tss: preprocessed.tss, if_: preprocessed.if_, np: preprocessed.np, avg_hr: preprocessed.avg_hr, max_hr: preprocessed.max_hr, avg_power: preprocessed.avg_power, max_power: preprocessed.max_power, hr_zone_dist: preprocessed.hr_zone_dist, power_zone_dist: preprocessed.power_zone_dist, fatigue: preprocessed.fatigue, form: preprocessed.form, fitness: preprocessed.fitness, injury_flags: preprocessed.injury_flags, notes: preprocessed.notes, raw_activity_id: preprocessed.raw_id, data_source: preprocessed.data_source,
      })
      newCount++
    }
  }

  const { data: allSummaries } = await sb.from('training_summaries').select('*').eq('athlete_id', athleteId).order('date', { ascending: true })
  if (allSummaries?.length > 0) {
    const weeks = computeWeeklySummaries(allSummaries.map(s => ({ ...s, raw_id: s.raw_activity_id })))
    for (const w of weeks) {
      await sb.from('weekly_summaries').upsert({ athlete_id: athleteId, week_start: w.week_start, week_end: w.week_end, total_tss: w.total_tss, avg_if: w.avg_if, total_duration_sec: w.total_duration_sec, total_distance_m: w.total_distance_m, activity_count: w.activity_count, avg_fatigue: w.avg_fatigue, avg_form: w.avg_form, avg_fitness: w.avg_fitness }, { onConflict: 'athlete_id,week_start' })
    }
  }

  return json({ new_activities: newCount, total_activities: rawActivities.length, profile_updated: true, weeks_updated: allSummaries ? computeWeeklySummaries(allSummaries.map(s => ({ ...s, raw_id: s.raw_activity_id }))).length : 0, timestamp: new Date().toISOString() })
}

// ============ Memory Stats ============
async function handleMemoryStats(athleteId: string, body: any): Promise<Response> {
  const { action, session_id } = body || {}
  const sb = getSupabase()
  if (action === 'clear_session' && session_id) {
    await sb.from('chat_memories').delete().eq('session_id', session_id).eq('athlete_id', athleteId)
    return json({ success: true })
  }
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const [shortTermResult, longTermResult, sessionsResult, goalsResult] = await Promise.all([
    sb.from('chat_memories').select('id', { count: 'exact', head: true }).eq('athlete_id', athleteId).gte('created_at', fourteenDaysAgo),
    sb.from('chat_memories').select('id', { count: 'exact', head: true }).eq('athlete_id', athleteId),
    sb.from('chat_memories').select('session_id').eq('athlete_id', athleteId).limit(100),
    sb.from('athlete_goals').select('id', { count: 'exact', head: true }).eq('athlete_id', athleteId).eq('status', 'active'),
  ])
  const sessionIds = new Set<string>()
  if (sessionsResult.data) { for (const row of sessionsResult.data) sessionIds.add(row.session_id) }
  return json({ short_term_days: 14, long_term_entries: longTermResult.count || 0, chat_sessions: sessionIds.size, goals_count: goalsResult.count || 0 })
}

// ============ Workout Edit ============
async function handleWorkoutEdit(athleteId: string, body: any): Promise<Response> {
  const { action, description, workout_id, workout_data, edit_action } = body || {}
  const sb = getSupabase()

  if (action === 'preview') {
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const dsHeaders = getDeepSeekHeaders()
    const dsResp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST', headers: dsHeaders,
      body: JSON.stringify({
        model: 'deepseek-chat', max_tokens: 1000, temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `你是自行车训练课程设计助手。根据用户的自然语言描述，解析出训练课程的参数，输出纯JSON（不要包裹在代码块中）。

interval.icu 需要的 JSON 结构：
{
  "name": "课程名称（简短，如 2小时Z2耐力骑行）",
  "description": "课程描述（一句话，如 心率控制在120-140bpm的耐力骑行）",
  "type": "Ride",
  "date": "${tomorrowStr}",          // 默认明天，如果用户指定了日期则用指定日期（格式 YYYY-MM-DD）
  "duration_min": 120,               // 预计时长（分钟）
  "target_hr_low": 120,              // 目标心率下限（用户描述的心率区推算出bpm，无则0）
  "target_hr_high": 150,             // 目标心率上限
  "target_power_low": 150,           // 目标功率下限（瓦特，无则0）
  "target_power_high": 220,          // 目标功率上限
  "zones": "Z2",                     // 训练区间（如 Z1/Z2/Z3/Z4/Z5/Z6/Z7）
  "notes": "附加说明"                // 任何额外备注
}

心率区参考（如用户说Z2）：Z1:<60%HRmax, Z2:60-70%, Z3:70-80%, Z4:80-90%, Z5:90-100%, Z6:>100%。
功率区参考（如用户说Z2耐力）：Z2约55-75% FTP。
如果用户没有提到具体日期，默认用明天（${tomorrowStr}）。
`
          },
          { role: 'user', content: `用户描述：${description}\n\n请解析并生成训练课程 JSON。` },
        ],
      }),
    })
    if (!dsResp.ok) throw new Error(`DeepSeek API error: ${dsResp.status}`)
    const dsData = await dsResp.json()
    const reply = dsData.choices?.[0]?.message?.content || ''
    let workoutData: any = {}
    try {
      const clean = reply.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
      workoutData = JSON.parse(clean)
      // Build summary for preview
      workoutData._preview_summary = `${workoutData.name || '训练课程'}\n日期: ${workoutData.date || tomorrowStr}\n类型: ${workoutData.type || 'Ride'} | 时长: ${workoutData.duration_min || 60}min\n${workoutData.zones ? '区间: ' + workoutData.zones : ''}${workoutData.notes ? '\n备注: ' + workoutData.notes : ''}`
    } catch {
      workoutData = { raw_plan: reply, error: 'Failed to parse workout JSON' }
    }
    await sb.from('workout_edits').insert({
      athlete_id: athleteId,
      workout_id: workout_id || `new_${Date.now()}`,
      action: 'create',
      changes: workoutData,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    return json({
      action: 'create',
      workout_data: workoutData,
      summary: workoutData._preview_summary || workoutData.name || workoutData.raw_plan || 'Workout generated',
    })
  }

  if (action === 'apply') {
    const icuHeaders = getIntervalIcuHeaders()
    const baseUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/workouts`
    let method = 'POST'
    let url = baseUrl
    const payload: any = { ...workout_data }

    // Clean preview-internal fields
    delete payload._preview_summary
    delete payload.raw_plan
    delete payload.error

    if (edit_action === 'update' && workout_id) { method = 'PUT'; url = `${baseUrl}/${workout_id}` }
    else if (edit_action === 'delete' && workout_id) { method = 'DELETE'; url = `${baseUrl}/${workout_id}`; payload.id = workout_id }

    // Build proper ICU workout payload for create/update
    if (method !== 'DELETE') {
      const dateStr = payload.date || new Date().toISOString().split('T')[0]
      const startDate = `${dateStr}T08:00:00`

      // Build MRC workout_doc from zones / target data if not provided
      if (!payload.workout_doc) {
        const durationSec = (payload.duration_min || 60) * 60
        const name = payload.name || 'AI Generated Workout'
        const desc = payload.description || ''
        let mrcIntervals = ''
        if (payload.zones) {
          const zone = payload.zones.replace(/^Z/, '')
          mrcIntervals = `<Intervals Repeat="1" CAD="0" OnPower="0" OnHR="0"><Interval Duration="${durationSec}" PowerLow="${payload.target_power_low || 0}" PowerHigh="${payload.target_power_high || 0}" HR="0" HRHigh="0" cadence="0" cadenceRest="0" Zone="${zone}" Type="FreeRide"/></Intervals>`
        } else {
          mrcIntervals = `<Intervals Repeat="1" CAD="0" OnPower="0" OnHR="0"><Interval Duration="${durationSec}" PowerLow="${payload.target_power_low || 0}" PowerHigh="${payload.target_power_high || 0}" HR="${payload.target_hr_low || 0}" HRHigh="${payload.target_hr_high || 0}" cadence="0" cadenceRest="0" Zone="" Type="FreeRide"/></Intervals>`
        }
        payload.workout_doc = `<workowork><IntervalsT Type="Ride" Goal="0" IsDamper="0" SportType="bike">${mrcIntervals}</IntervalsT></workowork>`
      }

      // Ensure required fields exist
      payload.name = payload.name || '训练课程'
      payload.description = payload.description || ''
      payload.type = payload.type || 'Ride'
      payload.start_date = startDate
    }

    const icuResp = await fetch(url, {
      method,
      headers: icuHeaders,
      body: method !== 'DELETE' ? JSON.stringify(payload) : undefined,
    })
    if (!icuResp.ok) {
      const errText = await icuResp.text()
      console.error(`ICU workouts ${method} error (${icuResp.status}):`, errText.substring(0, 500))
      throw new Error(`Interval.icu API error: ${icuResp.status} - ${errText}`)
    }
    const icuResult = await icuResp.json()
    await sb.from('workout_edits').update({ status: 'applied' }).eq('workout_id', workout_id).eq('athlete_id', athleteId)
    return json({ success: true, workout_id: icuResult.id || workout_id })
  }

  return error('Invalid action. Use "preview" or "apply"', 400)
}

// ============ Debug DB ============
async function handleDebugDb(athleteId: string): Promise<Response> {
  const sb = getSupabase()
  const [trainingCount, trainingAll, weeklyCount, profileExists] = await Promise.all([
    sb.from('training_summaries').select('count', { count: 'exact', head: true }).eq('athlete_id', athleteId),
    sb.from('training_summaries').select('id,date,type,name,tss,athlete_id').eq('athlete_id', athleteId).order('date', { ascending: false }).limit(20),
    sb.from('weekly_summaries').select('count', { count: 'exact', head: true }).eq('athlete_id', athleteId),
    sb.from('athlete_profiles').select('athlete_id,ftp,weight,max_hr').eq('athlete_id', athleteId).single(),
  ])
  return json({ athlete_id_used: athleteId, training_count: trainingCount.count || 0, weekly_count: weeklyCount.count || 0, profile: profileExists.data || null, recent_trainings: trainingAll.data || [] })
}

// ============ Main Router ============
async function handleRequest(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const url = new URL(req.url)
  const pathname = url.pathname

  // ===== API Routes =====
  if (pathname.startsWith('/api/')) {
    try {
      // Public route: PIN auth (no token required)
      if (pathname === '/api/pin-auth') {
        const body = req.body ? await req.json().catch(() => ({})) : {}
      return await handlePinAuth(req, body)
      }

      // Protected routes: PIN token required
      const token = req.headers.get('x-pin-token')
      if (!token) return error('PIN required', 401)
      let athleteId: string
      try {
        athleteId = await verifyPinToken(token)
      } catch (e: unknown) {
        return apiError(e)
      }
      const body = req.body ? await req.json().catch(() => ({})) : {}

      switch (pathname) {
        case '/api/chat': return await handleChat(athleteId, body)
        case '/api/dashboard': return await handleDashboard(athleteId)
        case '/api/sync-data': return await handleSyncData(athleteId, body)
        case '/api/memory-stats': return await handleMemoryStats(athleteId, body)
        case '/api/workout-edit': return await handleWorkoutEdit(athleteId, body)
        case '/api/debug-db': return await handleDebugDb(athleteId)
        default: return error('API not found', 404)
      }
    } catch (err: unknown) {
      console.error('Server error:', err instanceof Error ? err.message : err)
      return apiError(err)
    }
  }

  // ===== Static & SPA Routes =====
  const staticResponse = await serveStatic(pathname)
  if (staticResponse) return staticResponse

  // Should never reach here (SPA fallback handles everything)
  return new Response('Not Found', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } })
}

// Deno Deploy entry point
export default { fetch: handleRequest }