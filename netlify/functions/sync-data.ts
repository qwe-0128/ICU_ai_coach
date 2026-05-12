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
    const athleteId = await verifyPinToken(token)

    const body = JSON.parse(event.body || '{}')
    const { force_full } = body
    const sb = getSupabase()
    const today = new Date().toISOString().split('T')[0]

    // ============ 0. Diagnostics ============
    const diagnostics: string[] = []
    diagnostics.push(`athleteId=${athleteId}`)
    diagnostics.push(`today=${today}`)

    // ============ 1. Fetch Profile ============
    const rawProfile = await fetchProfile(athleteId)
    diagnostics.push(`profile_keys=${Object.keys(rawProfile).slice(0, 10).join(',')}`)
    diagnostics.push(`profile_weight=${rawProfile.icu_weight || rawProfile.weight}`)

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
    diagnostics.push(`date_range=${startDate}~${today}`)

    // ============ 3. Fetch Activities ============
    const rawActivities = await fetchActivities(athleteId, startDate, today, diagnostics)
    diagnostics.push(`rawActivities_count=${rawActivities.length}`)
    
    if (rawActivities.length > 0) {
      const first = rawActivities[0]
      diagnostics.push(`first_activity_id=${first.id}`)
      diagnostics.push(`first_activity_type=${first.type}`)
      diagnostics.push(`first_activity_name=${first.name}`)
      diagnostics.push(`first_activity_keys=${Object.keys(first).slice(0, 15).join(',')}`)
      diagnostics.push(`first_icu_training_load=${first.icu_training_load}`)
      diagnostics.push(`first_icu_weighted_avg_watts=${first.icu_weighted_avg_watts}`)
      diagnostics.push(`first_icu_atl=${first.icu_atl}`)
      diagnostics.push(`first_icu_ctl=${first.icu_ctl}`)
    }

    // ============ 3b. Sync Profile (needs firstActivity for FTP/zones) ============
    const profile = preprocessProfile(rawProfile, rawActivities[0])
    const { error: profileErr } = await sb.from('athlete_profiles').upsert({
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
    if (profileErr) diagnostics.push(`profile_write_error=${profileErr.message || JSON.stringify(profileErr)}`)
    diagnostics.push(`processed_profile_ftp=${profile.ftp}, weight=${profile.weight}, maxHR=${profile.maxHR}`)

    let newCount = 0

    for (const raw of rawActivities) {
      const preprocessed = preprocessActivity(raw)
      if (!preprocessed.date) {
        diagnostics.push(`skipped_activity_no_date_id=${raw.id}`)
        continue
      }

      const { data: existing } = await sb
        .from('training_summaries')
        .select('id')
        .eq('raw_activity_id', preprocessed.raw_id)
        .limit(1)

      if (existing && existing.length > 0) {
        // Update existing
        const { error: updateErr } = await sb.from('training_summaries').update({
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
        if (updateErr) diagnostics.push(`update_error_${preprocessed.raw_id}=${updateErr.message || JSON.stringify(updateErr)}`)
      } else {
        // Insert new
        const { error: insertErr } = await sb.from('training_summaries').insert({
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
        if (insertErr) diagnostics.push(`insert_error_${preprocessed.raw_id}=${insertErr.message || JSON.stringify(insertErr)}`)
        else newCount++
      }
    }

    // ============ 4. Update Weekly Summaries ============
    const { data: allSummaries, error: summariesErr } = await sb
      .from('training_summaries')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: true })

    if (summariesErr) diagnostics.push(`summaries_read_error=${summariesErr.message || JSON.stringify(summariesErr)}`)

    if (allSummaries && allSummaries.length > 0) {
      const weeks = computeWeeklySummaries(allSummaries.map(s => ({
        ...s,
        raw_id: s.raw_activity_id,
      })))

      for (const w of weeks) {
        const { error: weekErr } = await sb.from('weekly_summaries').upsert({
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
        if (weekErr) diagnostics.push(`week_write_error_${w.week_start}=${weekErr.message || JSON.stringify(weekErr)}`)
      }
    }

    // ============ 5. Delete old data (keep last 6 months) ============
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await sb.from('training_summaries')
      .delete()
      .eq('athlete_id', athleteId)
      .lt('date', sixMonthsAgo)

    // ============ 6. Read back verification ============
    const { data: verifySummary, error: verifyErr } = await sb
      .from('training_summaries')
      .select('id')
      .eq('athlete_id', athleteId)
      .limit(1)
    diagnostics.push(`verify_summaries_after_sync=${verifySummary?.length || 0}, error=${verifyErr ? (verifyErr.message || JSON.stringify(verifyErr)) : 'none'}`)

    const { data: verifyProfile } = await sb
      .from('athlete_profiles')
      .select('ftp, weight, max_hr')
      .eq('athlete_id', athleteId)
      .single()
    diagnostics.push(`verify_profile_ftp=${verifyProfile?.ftp}, weight=${verifyProfile?.weight}, max_hr=${verifyProfile?.max_hr}`)

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        new_activities: newCount,
        total_activities: rawActivities.length,
        profile_updated: true,
        weeks_updated: allSummaries ? computeWeeklySummaries(allSummaries.map(s => ({...s, raw_id: s.raw_activity_id}))).length : 0,
        timestamp: new Date().toISOString(),
        diagnostics: diagnostics.join('; '),
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