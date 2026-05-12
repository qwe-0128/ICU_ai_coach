// ============ Interval.icu Data Preprocessor ============
// Reduces raw JSON (MBs) to structured summaries (~2KB) for DeepSeek consumption

import { getSupabase, getIntervalIcuHeaders } from './auth'

export interface PreprocessedActivity {
  date: string
  type: string
  name: string
  duration_sec: number
  distance_m: number
  tss: number
  if_: number
  np: number
  avg_hr: number
  max_hr: number
  avg_power: number
  max_power: number
  hr_zone_dist: Record<string, number>
  power_zone_dist: Record<string, number>
  fatigue: number
  form: number
  fitness: number
  injury_flags: string[]
  notes: string
  raw_id: string
}

export interface PreprocessedProfile {
  ftp: number
  weight: number
  maxHR: number
  restHR: number
  hrZones: { zone: number; low: number; high: number }[]
  powerZones: { zone: number; name: string; low: number; high: number }[]
  vo2max: number | null
}

function calcZoneDist(values: number[], thresholds: number[]): Record<string, number> {
  const dist: Record<string, number> = {}
  let total = 0
  for (const v of values) {
    let zone = thresholds.length + 1
    for (let i = 0; i < thresholds.length; i++) {
      if (v <= thresholds[i]) { zone = i + 1; break }
    }
    dist[`z${zone}`] = (dist[`z${zone}`] || 0) + 1
    total++
  }
  // Convert to percentages
  for (const k of Object.keys(dist)) {
    dist[k] = Math.round((dist[k] / total) * 100)
  }
  return dist
}

async function safeFetchJson(url: string, label: string): Promise<any> {
  const headers = getIntervalIcuHeaders()
  const resp = await fetch(url, { headers })
  
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error(`[${label}] HTTP ${resp.status}: ${body.substring(0, 300)}`)
    throw new Error(
      `Interval.icu ${label} 返回 HTTP ${resp.status} (非JSON). ` +
      `开头: ${body.substring(0, 150)}`
    )
  }
  
  const text = await resp.text()
  const trimmed = text.trim()
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) {
    console.error(`[${label}] 非JSON响应 (${resp.status}): ${trimmed.substring(0, 300)}`)
    throw new Error(
      `Interval.icu ${label} 返回 HTML 而非 JSON (HTTP ${resp.status}). ` +
      `开头: ${trimmed.substring(0, 150)}`
    )
  }
  return JSON.parse(trimmed)
}

export async function fetchActivities(
  athleteId: string,
  startDate: string,
  endDate: string,
  diagnostics?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const baseUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/activities`
  const params = new URLSearchParams({
    oldest: startDate,
    newest: endDate,
  })
  const fullUrl = `${baseUrl}?${params}`
  
  diag(diagnostics, `fetchActivities_url=${fullUrl.replace(athleteId, 'ATHLETE_ID')}`)
  
  const headers = getIntervalIcuHeaders()
  // Don't use safeFetchJson — capture raw response for diagnostics
  const resp = await fetch(fullUrl, { headers })
  const text = await resp.text()
  diag(diagnostics, `fetchActivities_status=${resp.status}`)
  diag(diagnostics, `fetchActivities_contentType=${resp.headers.get('content-type')}`)
  diag(diagnostics, `fetchActivities_bodyLen=${text.length}`)
  diag(diagnostics, `fetchActivities_bodyPrefix=${text.substring(0, 200).replace(/\n/g, ' ')}`)
  
  if (!resp.ok) {
    throw new Error(
      `Interval.icu activities 返回 HTTP ${resp.status}. ` +
      `开头: ${text.substring(0, 150)}`
    )
  }
  
  const trimmed = text.trim()
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) {
    throw new Error(
      `Interval.icu activities 返回 HTML 而非 JSON (HTTP ${resp.status}). ` +
      `开头: ${trimmed.substring(0, 150)}`
    )
  }
  return JSON.parse(trimmed)
}

function diag(arr: string[] | undefined, msg: string) {
  if (arr) arr.push(msg)
}

export async function fetchWellness(
  athleteId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const baseUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness`
  const params = new URLSearchParams({ oldest: startDate, newest: endDate })
  try {
    return await safeFetchJson(`${baseUrl}?${params}`, 'wellness')
  } catch {
    return [] // wellness 端点可能不可用，静默跳过
  }
}

export async function fetchProfile(athleteId: string): Promise<any> {
  const baseUrl = `https://intervals.icu/api/v1/athlete/${athleteId}`
  return safeFetchJson(baseUrl, 'profile')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function preprocessActivity(activity: any): PreprocessedActivity {
  // interval.icu API returns fields with icu_ prefix
  // Docs: https://intervals.icu/api/v1/docs
  const ftp = activity.icu_pm_ftp || activity.icu_ftp || 200
  const np = Math.round(activity.icu_weighted_avg_watts || 0)
  const if_ = ftp > 0 ? parseFloat((np / ftp).toFixed(2)) : 0
  const atl = Math.round(activity.icu_atl || 0)
  const ctl = Math.round(activity.icu_ctl || 0)
  
  // Average power: API doesn't always include average_watts,
  // compute from joules / recording_time when available
  let avgPower = 0
  if (activity.icu_joules && activity.icu_recording_time && activity.icu_recording_time > 0) {
    avgPower = Math.round(activity.icu_joules / activity.icu_recording_time)
  }

  // HR zones from activity-level icu_hr_zones thresholds
  const hrZones = activity.icu_hr_zones || []
  const powerZones = activity.icu_power_zones || []
  
  // PMC zones based on activity-level zone thresholds
  const pmcHrDist = hrZones.length > 1 
    ? calcPMCZoneDist(activity.average_heartrate, activity.max_heartrate, hrZones) 
    : {}
  const pmcPowerDist = powerZones.length > 1 && avgPower > 0
    ? calcPMCZoneDist(avgPower, 0, powerZones)
    : {}

  return {
    date: activity.start_date ? activity.start_date.split('T')[0] : '',
    type: activity.type || 'Ride',
    name: activity.name || '',
    duration_sec: Math.round((activity.moving_time || activity.elapsed_time || 0)),
    distance_m: Math.round(activity.distance || activity.icu_distance || 0),
    tss: Math.round(activity.icu_training_load || 0),
    if_,
    np,
    avg_hr: Math.round(activity.average_heartrate || 0),
    max_hr: Math.round(activity.max_heartrate || 0),
    avg_power: avgPower,
    max_power: Math.round(activity.icu_pm_p_max || 0),
    hr_zone_dist: pmcHrDist,
    power_zone_dist: pmcPowerDist,
    fatigue: atl,
    form: Math.round(ctl - atl),  // TSB = CTL - ATL (form)
    fitness: ctl,
    injury_flags: detectInjuryFlags(activity),
    notes: activity.description || '',
    raw_id: activity.id || '',
  }
}

/**
 * Calculate zone distribution from a single value + zone thresholds
 * Places the value into its zone (1-indexed), returns {zN: 100}
 * where N is the zone number (all 100% since it's a single summary value)
 */
function calcPMCZoneDist(
  value: number,
  maxValue: number,
  thresholds: number[]
): Record<string, number> {
  if (!value || thresholds.length < 2) return {}
  // thresholds are the zone boundaries (upper limits of each zone)
  // e.g. [128, 149, 171, 184, 194] means:
  // Z1: 0-128, Z2: 129-149, Z3: 150-171, Z4: 172-184, Z5: 185-194, Z6: 195+
  // But for %HRmax based: Z1 < 60%, Z2 60-70%, etc.
  // We'll simplify: place avg value into one zone = 100% distribution
  let zone = thresholds.length + 1 // default to highest zone
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value <= thresholds[i]) zone = i + 1
  }
  return { [`z${zone}`]: 100 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectInjuryFlags(activity: any): string[] {
  const flags: string[] = []
  const desc = (activity.description || '').toLowerCase()
  const name = (activity.name || '').toLowerCase()

  const injuryWords = ['受伤', '伤', '疼痛', '痛', '不适', 'injury', 'pain', 'sore', 'ache', 'hurt', 'knee', '膝盖', 'back', '背', '踝', 'ankle']
  for (const word of injuryWords) {
    if (desc.includes(word) || name.includes(word)) {
      flags.push('pain_noted')
      break
    }
  }

  // interval.icu uses icu_training_load as TSS
  const tss = activity.icu_training_load || 0
  const movingTime = activity.moving_time || activity.elapsed_time || 0
  const ftp = activity.icu_pm_ftp || activity.icu_ftp || 200
  const np = activity.icu_weighted_avg_watts || 0
  const ifVal = ftp > 0 ? np / ftp : 0

  if (tss > 200) flags.push('high_tss')
  if (ifVal > 0.95 && movingTime > 3600) {
    flags.push('high_intensity_long')
  }

  return flags
}

export function preprocessProfile(raw: any, firstActivity?: any): PreprocessedProfile {
  // Profile endpoint has: icu_weight, icu_resting_hr
  // FTP / maxHR / zones are per-activity, so we grab from firstActivity
  const weight = raw.icu_weight || raw.weight || 70
  const restHR = raw.icu_resting_hr || 55
  
  // Extract from first activity (most recent) if available
  const act = firstActivity || {}
  const ftp = act.icu_pm_ftp || act.icu_ftp || 200
  const maxHR = act.max_heartrate || 190
  
  // Build HR zones from activity thresholds
  const hrThresholds: number[] = act.icu_hr_zones || []
  const hrZones: { zone: number; low: number; high: number }[] = []
  if (hrThresholds.length > 1) {
    let prev = 0
    for (let i = 0; i < hrThresholds.length; i++) {
      hrZones.push({ zone: i + 1, low: prev, high: hrThresholds[i] })
      prev = hrThresholds[i]
    }
    // Add one more zone above the highest threshold
    hrZones.push({ zone: hrThresholds.length + 1, low: hrThresholds[hrThresholds.length - 1], high: 999 })
  }
  
  // Build power zones from activity thresholds
  const pwThresholds: number[] = act.icu_power_zones || []
  const zoneNames = ['Recovery', 'Endurance', 'Tempo', 'Sweet Spot', 'Threshold', 'VO2 Max', 'Anaerobic']
  const powerZones: { zone: number; name: string; low: number; high: number }[] = []
  if (pwThresholds.length > 1) {
    let prev = 0
    for (let i = 0; i < pwThresholds.length; i++) {
      powerZones.push({ zone: i + 1, name: zoneNames[i] || `Zone ${i+1}`, low: prev, high: pwThresholds[i] })
      prev = pwThresholds[i]
    }
    powerZones.push({ zone: pwThresholds.length + 1, name: 'Neuromuscular', low: pwThresholds[pwThresholds.length - 1], high: 9999 })
  }
  
  return {
    ftp,
    weight,
    maxHR,
    restHR,
    hrZones,
    powerZones,
    vo2max: raw.vo2max || null,
  }
}

export function computeWeeklySummaries(
  activities: PreprocessedActivity[]
): Array<{
  week_start: string; week_end: string; total_tss: number; avg_if: number;
  total_duration_sec: number; total_distance_m: number; activity_count: number;
  avg_fatigue: number; avg_form: number; avg_fitness: number;
}> {
  const weekMap: Map<string, PreprocessedActivity[]> = new Map()

  for (const a of activities) {
    if (!a.date) continue
    const d = new Date(a.date + 'T00:00:00Z')
    const dayOfWeek = d.getUTCDay()
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7))
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)
    const key = monday.toISOString().split('T')[0]
    if (!weekMap.has(key)) weekMap.set(key, [])
    weekMap.get(key)!.push(a)
  }

  const summaries: Array<{
    week_start: string; week_end: string; total_tss: number; avg_if: number;
    total_duration_sec: number; total_distance_m: number; activity_count: number;
    avg_fatigue: number; avg_form: number; avg_fitness: number;
  }> = []

  for (const [weekStart, acts] of weekMap.entries()) {
    const monday = new Date(weekStart + 'T00:00:00Z')
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)
    
    const totalTss = acts.reduce((s, a) => s + a.tss, 0)
    const ifs = acts.filter(a => a.if_ > 0).map(a => a.if_)
    
    summaries.push({
      week_start: weekStart,
      week_end: sunday.toISOString().split('T')[0],
      total_tss: Math.round(totalTss),
      avg_if: ifs.length > 0 ? parseFloat((ifs.reduce((s,v) => s+v, 0) / ifs.length).toFixed(2)) : 0,
      total_duration_sec: acts.reduce((s, a) => s + a.duration_sec, 0),
      total_distance_m: Math.round(acts.reduce((s, a) => s + a.distance_m, 0)),
      activity_count: acts.length,
      avg_fatigue: Math.round(acts.reduce((s,a) => s + a.fatigue, 0) / acts.length),
      avg_form: Math.round(acts.reduce((s,a) => s + a.form, 0) / acts.length),
      avg_fitness: Math.round(acts.reduce((s,a) => s + a.fitness, 0) / acts.length),
    })
  }

  return summaries.sort((a,b) => a.week_start.localeCompare(b.week_start))
}

// ============ Token-efficient prompt builder ============

export function buildSystemPrompt(
  profile: PreprocessedProfile,
  recent14d: PreprocessedActivity[],
  weekly42d: Awaited<ReturnType<typeof computeWeeklySummaries>>,
  goals: Array<{type: string; target: number; unit: string; deadline: string; status: string}>,
  memories: Array<{content: string; created_at: string}>,
  today: string
): string {
  // This builds a compact yet comprehensive system prompt (~2000-2500 tokens)
  const lines: string[] = [
    '## 你是自行车AI教练 (Cycling AI Coach)',
    '你基于 interval.icu 的训练数据，为自行车运动员提供专业的训练分析和建议。',
    '你可以讨论训练负荷(TSS/CTL)、强度因子(IF)、心率区间分布、功率区间分布、疲劳/状态/体能(PMC)等。',
    '你也可以帮助设计训练课程，并将其同步到 interval.icu。',
    '',
    `今天是 ${today}。`,
    '',
    '## 运动员生理画像',
    `FTP: ${profile.ftp}W | 体重: ${profile.weight}kg`,
    `最大心率: ${profile.maxHR}bpm | 静息心率: ${profile.restHR}bpm`,
  ]

  if (profile.hrZones.length > 0) {
    lines.push(`心率区间: ${profile.hrZones.map(z => `Z${z.zone}(${z.low}-${z.high}bpm)`).join(', ')}`)
  }
  if (profile.powerZones.length > 0) {
    lines.push(`功率区间: ${profile.powerZones.map(z => `Z${z.zone} ${z.name}(${z.low}-${z.high}W)`).join(', ')}`)
  }
  if (profile.vo2max) lines.push(`VO2max: ${profile.vo2max}`)

  lines.push('')
  lines.push('## 近14天训练详情')
  for (const a of recent14d) {
    const hrDist = Object.entries(a.hr_zone_dist).map(([k,v]) => `${k}:${v}%`).join(' ')
    const powerDist = Object.entries(a.power_zone_dist).map(([k,v]) => `${k}:${v}%`).join(' ')
    const flags = a.injury_flags.length > 0 ? ` ⚠️${a.injury_flags.join(',')}` : ''
    
    lines.push(
      `${a.date} | ${a.type} | ${a.name} | ${a.tss}TSS IF${a.if_} | ` +
      `${Math.round(a.duration_sec/60)}min ${(a.distance_m/1000).toFixed(1)}km | ` +
      `HR${a.avg_hr}/${a.max_hr}bpm PWR${a.avg_power}/${a.max_power}W | ` +
      `疲劳:${a.fatigue} 状态:${a.form} 体能:${a.fitness}` +
      (hrDist ? ` | HR:${hrDist}` : '') +
      (powerDist ? ` | PWR:${powerDist}` : '') +
      flags
    )
  }

  lines.push('')
  lines.push('## 近42天周度统计（每周一至周日）')
  for (const w of weekly42d) {
    lines.push(
      `${w.week_start} ~ ${w.week_end} | ` +
      `TSS:${w.total_tss} IF:${w.avg_if} | ` +
      `时长:${Math.round(w.total_duration_sec/3600)}h ${(w.total_distance_m/1000).toFixed(0)}km | ` +
      `活动:${w.activity_count}次 | ` +
      `疲劳:${w.avg_fatigue} 状态:${w.avg_form} 体能:${w.avg_fitness}`
    )
  }

  if (goals.length > 0) {
    lines.push('')
    lines.push('## 训练目标')
    for (const g of goals) {
      lines.push(`${g.type}: 目标${g.target}${g.unit} | 截止${g.deadline} | 状态:${g.status}`)
    }
  }

  if (memories.length > 0) {
    lines.push('')
    lines.push('## 历史对话记忆（语义检索结果）')
    for (const m of memories.slice(0, 5)) {
      lines.push(`- [${m.created_at}] ${m.content.substring(0, 200)}`)
    }
  }

  lines.push('')
  lines.push('## 指导原则')
  lines.push('1. 回答基于运动员的实际数据，避免空洞建议')
  lines.push('2. 训练建议参考PMC(Performance Management Chart)理论')
  lines.push('3. 注意区分不同训练区间的生理刺激')
  lines.push('4. 如果需要设计课程，先描述课程结构，用户确认后再写入 interval.icu')
  lines.push('5. 用中文回复')
  lines.push('6. 保持简洁，不要让回复过长（除非用户要求详细分析）')

  // Append the athlete_id and today for reference
  return lines.join('\n')
}