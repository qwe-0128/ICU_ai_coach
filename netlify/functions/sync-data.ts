// ============ Data Sync Netlify Function ============
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { getSupabase, getEnv, verifyPinToken, corsHeaders } from './utils/auth'
import {
  fetchActivities, fetchWellness, fetchProfile,
  preprocessActivity, preprocessProfile, computeWeeklySummaries,
} from './utils/preprocess'

const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  try {
    // Verify PIN
    const token = event.headers['x-pin-token']
    if (!token) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'PIN required' }) }
    }
    await verifyPinToken(token)

    const body = JSON.parse(event.body || '{}')
    const { force_full } = body
    const athleteId = getEnv('INTERVAL_ICU_ATHLETE_ID')
    const sb = getSupabase()
    const today = new Date().toISOString().split('T')[0]

    // ============ 1. Sync Profile ============
    const rawProfile = await fetchProfile(athleteId)
    const profile = preprocessProfile(rawProfile)
    await sb.from('athlete_profiles').upsert({
      athlete_id: athleteId,
      ftp: profile.ftp,
      weight: profile.weight,
      max_hr: profile.maxHR,
      rest_hr: profile.restHR,
      hr_zones: profile.hrZones,
      power_zones: profile.powerZones,
      vo2max: profile.vo2max,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' })

    // ============ 2. Determine date range ============
    let startDate: string
    if (force_full) {
      startDate = '2020-01-01'
    } else {
      // Get latest activity date from DB
      const { data: latest } = await sb
        .from('training_summaries')
        .select('date')
        .eq('athlete_id', athleteId)
        .order('date', { ascending: false })
        .limit(1)
        .single()
      
      if (latest) {
        const d = new Date(latest.date + 'T00:00:00Z')
        d.setUTCDate(d.getUTCDate() - 1) // Overlap 1 day for safety
        startDate = d.toISOString().split('T')[0]
      } else {
        startDate = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    }

    // ============ 3. Fetch & Preprocess Activities ============
    const rawActivities = await fetchActivities(athleteId, startDate, today)
    let newCount = 0

    for (const raw of rawActivities) {
      const preprocessed = preprocessActivity(raw)
      if (!preprocessed.date) continue

      const { data: existing, error: checkErr } = await sb
        .from('training_summaries')
        .select('id')
        .eq('raw_activity_id', preprocessed.raw_id)
        .limit(1)

      if (existing && existing.length > 0) {
        // Update existing
        await sb.from('training_summaries').update({
          date: preprocessed.date,
          type: preprocessed.type,
          name: preprocessed.name,
          duration_sec: preprocessed.duration_sec,
          distance_m: preprocessed.distance_m,
          tss: preprocessed.tss,
          if_: preprocessed.if_,
          np: preprocessed.np,
          avg_hr: preprocessed.avg_hr,
          max_hr: preprocessed.max_hr,
          avg_power: preprocessed.avg_power,
          max_power: preprocessed.max_power,
          hr_zone_dist: preprocessed.hr_zone_dist,
          power_zone_dist: preprocessed.power_zone_dist,
          fatigue: preprocessed.fatigue,
          form: preprocessed.form,
          fitness: preprocessed.fitness,
          injury_flags: preprocessed.injury_flags,
          notes: preprocessed.notes,
        }).eq('raw_activity_id', preprocessed.raw_id)
      } else {
        // Insert new
        await sb.from('training_summaries').insert({
          athlete_id: athleteId,
          date: preprocessed.date,
          type: preprocessed.type,
          name: preprocessed.name,
          duration_sec: preprocessed.duration_sec,
          distance_m: preprocessed.distance_m,
          tss: preprocessed.tss,
          if_: preprocessed.if_,
          np: preprocessed.np,
          avg_hr: preprocessed.avg_hr,
          max_hr: preprocessed.max_hr,
          avg_power: preprocessed.avg_power,
          max_power: preprocessed.max_power,
          hr_zone_dist: preprocessed.hr_zone_dist,
          power_zone_dist: preprocessed.power_zone_dist,
          fatigue: preprocessed.fatigue,
          form: preprocessed.form,
          fitness: preprocessed.fitness,
          injury_flags: preprocessed.injury_flags,
          notes: preprocessed.notes,
          raw_activity_id: preprocessed.raw_id,
        })
        newCount++
      }
    }

    // ============ 4. Update Weekly Summaries ============
    const { data: allSummaries } = await sb
      .from('training_summaries')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: true })

    if (allSummaries && allSummaries.length > 0) {
      const weeks = computeWeeklySummaries(allSummaries.map(s => ({
        ...s,
        raw_id: s.raw_activity_id,
      })))

      for (const w of weeks) {
        await sb.from('weekly_summaries').upsert({
          athlete_id: athleteId,
          week_start: w.week_start,
          week_end: w.week_end,
          total_tss: w.total_tss,
          avg_if: w.avg_if,
          total_duration_sec: w.total_duration_sec,
          total_distance_m: w.total_distance_m,
          activity_count: w.activity_count,
          avg_fatigue: w.avg_fatigue,
          avg_form: w.avg_form,
          avg_fitness: w.avg_fitness,
        }, { onConflict: 'athlete_id,week_start' })
      }
    }

    // ============ 5. Delete old data (keep last 6 months) ============
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await sb.from('training_summaries')
      .delete()
      .eq('athlete_id', athleteId)
      .lt('date', sixMonthsAgo)

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        new_activities: newCount,
        total_activities: rawActivities.length,
        profile_updated: true,
        weeks_updated: allSummaries ? computeWeeklySummaries(allSummaries.map(s => ({...s, raw_id: s.raw_activity_id}))).length : 0,
        timestamp: new Date().toISOString(),
      }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('Sync error:', message)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: message }),
    }
  }
}

export { handler }