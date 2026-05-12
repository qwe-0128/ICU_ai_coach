import { createClient } from '@supabase/supabase-js'

// These will be replaced at build time with environment variables
// or loaded from Netlify environment on the server side
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Server-side Supabase client (used in Netlify Functions)
export const createServerSupabase = (url: string, serviceKey: string) => {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

// ============ Database Types ============

export interface CyclingProfile {
  id?: string
  athlete_id: string
  ftp: number
  weight: number
  max_hr: number
  rest_hr: number
  hr_zones: { zone: number; low: number; high: number }[]
  power_zones: { zone: number; name: string; low: number; high: number }[]
  vo2max: number | null
  updated_at: string
}

export interface TrainingSummary {
  id?: string
  athlete_id: string
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
  raw_activity_id: string
}

export interface WeeklySummary {
  id?: string
  athlete_id: string
  week_start: string
  week_end: string
  total_tss: number
  avg_if: number
  total_duration_sec: number
  total_distance_m: number
  activity_count: number
  avg_fatigue: number
  avg_form: number
  avg_fitness: number
}

export interface AthleteGoal {
  id?: string
  athlete_id: string
  type: 'ftp' | 'weight' | 'endurance' | 'race' | 'custom'
  target: number
  unit: string
  deadline: string
  progress: number
  status: 'active' | 'achieved' | 'abandoned'
  notes: string
  created_at: string
  updated_at: string
}

export interface ChatMemory {
  id?: string
  athlete_id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  embedding: number[] | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface WorkoutEdit {
  id?: string
  athlete_id: string
  workout_id: string
  action: 'create' | 'update' | 'delete'
  changes: Record<string, unknown>
  status: 'pending' | 'applied' | 'failed'
  created_at: string
}

export interface PinSession {
  id?: string
  athlete_id: string
  pin_hash: string
  attempts: number
  locked_until: string | null
  created_at: string
  last_access: string
}