// ============ Workout Edit Netlify Function ============
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { getSupabase, getEnv, verifyPinToken, corsHeaders, getDeepSeekHeaders, getIntervalIcuHeaders } from './utils/auth'

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
    const { action, description, workout_id, workout_data, edit_action } = body

    if (action === 'preview') {
      // Use DeepSeek to interpret user's intent and generate workout JSON
      const dsResp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          ...getDeepSeekHeaders(),
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `你是自行车训练课程设计助手。根据用户的描述，生成符合 interval.icu API 格式的训练课程 JSON。

interval.icu 课程格式：
{
  "name": "课程名称",
  "description": "课程描述",
  "type": "Ride" | "VirtualRide",
  "workout_doc": "MRC格式的训练文档，例如: - 20min WU @ 50-60% FTP\\n- 5x 5min @ 105% FTP, 5min RI @ 55% FTP\\n- 15min CD @ 50% FTP"
}

输出必须是纯 JSON，不要包裹在代码块中。`,
            },
            {
              role: 'user',
              content: `用户描述：${description}\n\n请生成训练课程 JSON。`,
            },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        }),
      })

      if (!dsResp.ok) throw new Error(`DeepSeek API error: ${dsResp.status}`)
      const dsData = await dsResp.json()
      const reply = dsData.choices?.[0]?.message?.content || ''

      // Try to parse the JSON from the reply
      let workoutData: Record<string, unknown> = {}
      try {
        // Clean up potential markdown code fences
        const clean = reply.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
        workoutData = JSON.parse(clean)
      } catch {
        workoutData = { raw_plan: reply, error: 'Failed to parse workout JSON' }
      }

      // Save as pending workout edit
      await getSupabase().from('workout_edits').insert({
        athlete_id: athleteId,
        workout_id: workout_id || `new_${Date.now()}`,
        action: 'create',
        changes: workoutData,
        status: 'pending',
        created_at: new Date().toISOString(),
      })

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          action: 'create',
          workout_data: workoutData,
          summary: workoutData.name || workoutData.raw_plan || 'Workout generated',
        }),
      }
    }

    if (action === 'apply') {
      // Push workout to interval.icu
      const icuHeaders = getIntervalIcuHeaders()
      const baseUrl = `https://interval.icu/api/v1/athlete/${athleteId}/workouts`

      let method = 'POST'
      let url = baseUrl
      const payload: Record<string, unknown> = { ...workout_data }

      if (edit_action === 'update' && workout_id) {
        method = 'PUT'
        url = `${baseUrl}/${workout_id}`
      } else if (edit_action === 'delete' && workout_id) {
        method = 'DELETE'
        url = `${baseUrl}/${workout_id}`
      }

      const icuResp = await fetch(url, {
        method,
        headers: icuHeaders,
        body: method !== 'DELETE' ? JSON.stringify(payload) : undefined,
      })

      if (!icuResp.ok) {
        const errText = await icuResp.text()
        throw new Error(`Interval.icu API error: ${icuResp.status} - ${errText}`)
      }

      const icuResult = await icuResp.json()

      // Update status in DB
      await getSupabase().from('workout_edits').update({
        status: 'applied',
      }).eq('workout_id', workout_id).eq('athlete_id', athleteId)

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          workout_id: icuResult.id || workout_id,
        }),
      }
    }

    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid action. Use "preview" or "apply"' }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('Workout edit error:', message)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: message }),
    }
  }
}

export { handler }