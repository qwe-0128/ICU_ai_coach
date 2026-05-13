// ============ API Client (Frontend) ============
// Deno Deploy 全栈部署：前端与 API 同源，使用相对路径
const API_BASE = '/api'

async function callFunction(name: string, body: Record<string, unknown>) {
  const storedPin = localStorage.getItem('icu_pin_session')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (storedPin) headers['x-pin-token'] = storedPin

  const resp = await fetch(`${API_BASE}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (resp.status === 401) {
    localStorage.removeItem('icu_pin_session')
    window.dispatchEvent(new CustomEvent('pin-required'))
    throw new Error('PIN required')
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || `Request failed: ${resp.status}`)
  }

  return resp.json()
}

// ============ PIN Auth ============

export async function verifyPin(pin: string): Promise<{ success: boolean; token: string }> {
  return callFunction('pin-auth', { action: 'verify', pin })
}

export async function setPin(pin: string): Promise<{ success: boolean }> {
  return callFunction('pin-auth', { action: 'set', pin })
}

// ============ Data Sync ============

export interface SyncResult {
  new_activities: number
  total_activities: number
  profile_updated: boolean
  weeks_updated: number
  timestamp: string
  diagnostics: string
}

export async function syncData(forceFull?: boolean): Promise<SyncResult> {
  return callFunction('sync-data', { force_full: forceFull || false })
}

// ============ Chat ============

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  reply: string
  session_id: string
  tokens_used: number
  memories_retrieved: number
}

export async function sendChat(
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  return callFunction('chat', { message, session_id: sessionId })
}

// ============ Workout Management ============

export interface WorkoutPreview {
  action: 'create' | 'update' | 'delete'
  workout_id?: string
  workout_data?: Record<string, unknown>
  summary: string
}

export async function previewWorkoutEdit(
  description: string,
  sessionId?: string
): Promise<WorkoutPreview> {
  return callFunction('workout-edit', {
    action: 'preview',
    description,
    session_id: sessionId,
  })
}

export async function applyWorkoutEdit(
  workoutId: string,
  workoutData: Record<string, unknown>,
  action: string
): Promise<{ success: boolean; workout_id: string }> {
  return callFunction('workout-edit', {
    action: 'apply',
    workout_id: workoutId,
    workout_data: workoutData,
    edit_action: action,
  })
}

// ============ Memory Management ============

export interface MemoryStats {
  short_term_days: number
  long_term_entries: number
  chat_sessions: number
  goals_count: number
}

export async function getMemoryStats(): Promise<MemoryStats> {
  return callFunction('memory-stats', {})
}

export async function clearChatHistory(sessionId: string): Promise<{ success: boolean }> {
  return callFunction('memory-stats', { action: 'clear_session', session_id: sessionId })
}

// ============ Data Retrieval ============

export interface DashboardData {
  total_count: number
  profile: Record<string, unknown>
  recent_42d: Record<string, unknown>[]
  weekly_90d: Record<string, unknown>[]
  goals: Record<string, unknown>[]
  last_sync: string
  debug: {
    athlete_id: string
    profile_exists: boolean
    profile_error: string | null
    training_total_in_db: number
    training_returned: number
    weekly_returned: number
    training_error: string | null
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  return callFunction('dashboard', {})
}