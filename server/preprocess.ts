// ============ Interval.icu Data Preprocessor (Deno) ============
// @ts-nocheck
import { getSupabase, getIntervalIcuHeaders } from './auth.ts'

export interface PreprocessedActivity {
  date: string; type: string; name: string; duration_sec: number; distance_m: number
  tss: number; if_: number; np: number; avg_hr: number; max_hr: number
  avg_power: number; max_power: number
  hr_zone_dist: Record<string, number>; power_zone_dist: Record<string, number>
  fatigue: number; form: number; fitness: number
  injury_flags: string[]; notes: string; raw_id: string
  data_source: 'icu' | 'strava_empty' | 'unknown'
}

export interface PreprocessedProfile {
  ftp: number; weight: number; maxHR: number; restHR: number
  hrZones: { zone: number; low: number; high: number }[]
  powerZones: { zone: number; name: string; low: number; high: number }[]
  vo2max: number | null
}

async function safeFetchJson(url: string, label: string): Promise<any> {
  const headers = getIntervalIcuHeaders()
  const resp = await fetch(url, { headers })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error(`[${label}] HTTP ${resp.status}: ${body.substring(0, 300)}`)
    throw new Error(`Interval.icu ${label} 返回 HTTP ${resp.status}. 开头: ${body.substring(0, 150)}`)
  }
  const text = await resp.text()
  const trimmed = text.trim()
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) {
    console.error(`[${label}] 非JSON响应: ${trimmed.substring(0, 300)}`)
    throw new Error(`Interval.icu ${label} 返回 HTML 而非 JSON. 开头: ${trimmed.substring(0, 150)}`)
  }
  return JSON.parse(trimmed)
}

export async function fetchActivities(athleteId: string, startDate: string, endDate: string, diagnostics?: string[]): Promise<any[]> {
  const baseUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/activities`
  const params = new URLSearchParams({ oldest: startDate, newest: endDate })
  const fullUrl = `${baseUrl}?${params}`
  diag(diagnostics, `fetchActivities_url=${fullUrl.replace(athleteId, 'ATHLETE_ID')}`)
  const headers = getIntervalIcuHeaders()
  const resp = await fetch(fullUrl, { headers })
  const text = await resp.text()
  diag(diagnostics, `fetchActivities_status=${resp.status}`)
  diag(diagnostics, `fetchActivities_bodyLen=${text.length}`)
  diag(diagnostics, `fetchActivities_bodyPrefix=${text.substring(0, 200).replace(/\n/g, ' ')}`)
  if (!resp.ok) throw new Error(`Interval.icu activities HTTP ${resp.status}. 开头: ${text.substring(0, 150)}`)
  const trimmed = text.trim()
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) {
    throw new Error(`Interval.icu activities 返回非JSON. 开头: ${trimmed.substring(0, 150)}`)
  }
  return JSON.parse(trimmed)
}

export async function fetchWellness(athleteId: string, startDate: string, endDate: string): Promise<any[]> {
  const baseUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness`
  const params = new URLSearchParams({ oldest: startDate, newest: endDate })
  try { return await safeFetchJson(`${baseUrl}?${params}`, 'wellness') } catch { return [] }
}

export async function fetchProfile(athleteId: string): Promise<any> {
  return safeFetchJson(`https://intervals.icu/api/v1/athlete/${athleteId}`, 'profile')
}

function diag(arr: string[] | undefined, msg: string) { if (arr) arr.push(msg) }

/** Detect if activity has performance data (power/heartrate/TSS) — Strava-synced activities often lack these */
function detectDataSource(activity: any): 'icu' | 'strava_empty' | 'unknown' {
  const externalId = String(activity.external_id || activity.provider || '')
  const isStrava = externalId.toLowerCase().includes('strava') ||
    String(activity.name || '').toLowerCase().includes('strava') ||
    String(activity.description || '').toLowerCase().includes('strava')

  const hasPerformanceData =
    (activity.icu_training_load && activity.icu_training_load > 0) ||
    (activity.average_heartrate && activity.average_heartrate > 0) ||
    (activity.icu_weighted_avg_watts && activity.icu_weighted_avg_watts > 0) ||
    (activity.icu_joules && activity.icu_joules > 0)

  if (isStrava && !hasPerformanceData) return 'strava_empty'
  if (!isStrava && hasPerformanceData) return 'icu'
  if (isStrava && hasPerformanceData) return 'icu'
  return 'unknown'
}

export function preprocessActivity(activity: any, profileFtp?: number): PreprocessedActivity {
  // FTP fallback: use activity value first, then profile value, then default 200
  const ftpRaw = activity.icu_pm_ftp || activity.icu_ftp || 0
  const ftp = ftpRaw > 0 ? ftpRaw : (profileFtp || 200)
  const np = Math.round(activity.icu_weighted_avg_watts || 0)
  const if_ = ftp > 0 ? parseFloat((np / ftp).toFixed(2)) : 0
  let avgPower = 0
  if (activity.icu_joules && activity.icu_recording_time && activity.icu_recording_time > 0) {
    avgPower = Math.round(activity.icu_joules / activity.icu_recording_time)
  }
  const dataSource = detectDataSource(activity)
  return {
    date: (activity.start_date || activity.start_date_local || '').split('T')[0],
    type: activity.type || 'Ride',
    name: activity.name || '',
    duration_sec: Math.round((activity.moving_time || activity.elapsed_time || 0)),
    distance_m: Math.round(activity.distance || activity.icu_distance || 0),
    tss: Math.round(activity.icu_training_load || 0),
    if_, np,
    avg_hr: Math.round(activity.average_heartrate || 0),
    max_hr: Math.round(activity.max_heartrate || 0),
    avg_power: avgPower,
    max_power: Math.round(activity.icu_pm_p_max || 0),
    hr_zone_dist: {},
    power_zone_dist: {},
    fatigue: Math.round(activity.icu_atl || 0),
    form: Math.round((activity.icu_ctl || 0) - (activity.icu_atl || 0)),
    fitness: Math.round(activity.icu_ctl || 0),
    injury_flags: detectInjuryFlags(activity),
    notes: activity.description || '',
    raw_id: String(activity.id || ''),
    data_source: dataSource,
  }
}

function detectInjuryFlags(activity: any): string[] {
  const flags: string[] = []
  const desc = (activity.description || '').toLowerCase()
  const name = (activity.name || '').toLowerCase()
  const injuryWords = ['受伤','伤','疼痛','痛','不适','injury','pain','sore','ache','hurt','knee','膝盖','back','背','踝','ankle']
  for (const word of injuryWords) { if (desc.includes(word) || name.includes(word)) { flags.push('pain_noted'); break } }
  const tss = activity.icu_training_load || 0
  const movingTime = activity.moving_time || activity.elapsed_time || 0
  const np = activity.icu_weighted_avg_watts || 0
  const ftp = activity.icu_pm_ftp || activity.icu_ftp || 200
  if (tss > 200) flags.push('high_tss')
  if (np / ftp > 0.95 && movingTime > 3600) flags.push('high_intensity_long')
  return flags
}

export function preprocessProfile(raw: any, firstActivity?: any): PreprocessedProfile {
  const act = firstActivity || {}
  return {
    ftp: act.icu_pm_ftp || act.icu_ftp || raw.ftp || 200,
    weight: raw.icu_weight || raw.weight || 70,
    maxHR: act.max_heartrate || raw.max_hr || raw.max_heartrate || 190,
    restHR: raw.icu_resting_hr || raw.rest_hr || 55,
    hrZones: [],
    powerZones: [],
    vo2max: raw.vo2max || null,
  }
}

export function computeWeeklySummaries(activities: PreprocessedActivity[]) {
  const weekMap: Map<string, PreprocessedActivity[]> = new Map()
  for (const a of activities) {
    if (!a.date) continue
    const d = new Date(a.date + 'T00:00:00Z')
    const dayOfWeek = d.getUTCDay()
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7))
    const key = monday.toISOString().split('T')[0]
    if (!weekMap.has(key)) weekMap.set(key, [])
    weekMap.get(key)!.push(a)
  }
  const summaries: any[] = []
  for (const [weekStart, acts] of weekMap.entries()) {
    const monday = new Date(weekStart + 'T00:00:00Z')
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)
    const totalTss = acts.reduce((s, a) => s + a.tss, 0)
    const ifs = acts.filter(a => a.if_ > 0).map(a => a.if_)
    summaries.push({
      week_start: weekStart, week_end: sunday.toISOString().split('T')[0],
      total_tss: Math.round(totalTss),
      avg_if: ifs.length > 0 ? parseFloat((ifs.reduce((s,v)=>s+v,0)/ifs.length).toFixed(2)) : 0,
      total_duration_sec: acts.reduce((s,a)=>s+a.duration_sec,0),
      total_distance_m: Math.round(acts.reduce((s,a)=>s+a.distance_m,0)),
      activity_count: acts.length,
      avg_fatigue: Math.round(acts.reduce((s,a)=>s+a.fatigue,0)/acts.length),
      avg_form: Math.round(acts.reduce((s,a)=>s+a.form,0)/acts.length),
      avg_fitness: Math.round(acts.reduce((s,a)=>s+a.fitness,0)/acts.length),
    })
  }
  return summaries.sort((a,b) => a.week_start.localeCompare(b.week_start))
}

export function buildSystemPrompt(profile: any, recent14d: any[], weekly42d: any[], goals: any[], memories: any[], today: string): string {
  const lines: string[] = [
    '## 你是自行车AI教练 (Cycling AI Coach)',
    '你基于 interval.icu 的训练数据，为自行车运动员提供专业的训练分析和建议。',
    `今天是 ${today}。`,
    '',
    '## 运动员生理画像',
    `FTP: ${profile.ftp}W | 体重: ${profile.weight}kg | 最大心率: ${profile.maxHR}bpm | 静息心率: ${profile.restHR}bpm`,
    '',
    '## 近14天训练详情',
  ]
  let stravaEmptyCount = 0
  for (const a of recent14d) {
    // Strava empty activities: compact format, save tokens
    if (a.data_source === 'strava_empty') {
      stravaEmptyCount++
      lines.push(`${a.date} | ${a.type} | ${a.name || '未命名'} | ${(a.distance_m/1000).toFixed(1)}km ${Math.round(a.duration_sec/60)}min | 🔒Strava隐私限制，无详细表现数据`)
      continue
    }
    const flags = a.injury_flags?.length > 0 ? ` ⚠️${a.injury_flags.join(',')}` : ''
    const sourceTag = a.data_source === 'unknown' ? ' [?]' : ''
    lines.push(`${a.date} | ${a.type} | ${a.name} | ${a.tss}TSS IF${a.if_} | ${Math.round(a.duration_sec/60)}min ${(a.distance_m/1000).toFixed(1)}km | HR${a.avg_hr}/${a.max_hr}bpm PWR${a.avg_power}/${a.max_power}W | 疲劳:${a.fatigue} 状态:${a.form} 体能:${a.fitness}${flags}${sourceTag}`)
  }
  if (stravaEmptyCount > 0) {
    lines.push(`\n⚠️ 以上 ${stravaEmptyCount} 条来自Strava同步的活动缺少详细表现数据（因Strava隐私政策限制），仅提供距离和时长。`)
  }
  lines.push('', '## 近42天周度统计')
  for (const w of weekly42d) {
    lines.push(`${w.week_start}~${w.week_end} | TSS:${w.total_tss} IF:${w.avg_if} | ${Math.round(w.total_duration_sec/3600)}h ${(w.total_distance_m/1000).toFixed(0)}km | 活动:${w.activity_count}次 | 疲劳:${w.avg_fatigue} 状态:${w.avg_form} 体能:${w.avg_fitness}`)
  }
  if (goals?.length > 0) {
    lines.push('', '## 训练目标')
    for (const g of goals) lines.push(`${g.type}: 目标${g.target}${g.unit} | 截止${g.deadline}`)
  }
  if (memories?.length > 0) {
    lines.push('', '## 历史对话记忆')
    for (const m of memories.slice(0, 5)) lines.push(`- [${m.created_at}] ${m.content?.substring(0, 200) || ''}`)
  }
  lines.push('', '## 指导原则', '1. 基于运动员实际数据回答', '2. 参考PMC理论', '3. 用中文回复', '4. 保持简洁')
  return lines.join('\n')
}