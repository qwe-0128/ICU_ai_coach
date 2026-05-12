-- ============ 骑行AI教练 - Supabase 数据库迁移 ============
-- 在 Supabase Dashboard > SQL Editor 中执行此脚本

-- ============ 1. athlete_profiles (运动员档案) ============
CREATE TABLE IF NOT EXISTS athlete_profiles (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id  TEXT UNIQUE NOT NULL,
  ftp         INT DEFAULT 200,
  weight      REAL DEFAULT 70,
  max_hr      INT DEFAULT 190,
  rest_hr     INT DEFAULT 55,
  hr_zones    JSONB DEFAULT '[]'::jsonb,
  power_zones JSONB DEFAULT '[]'::jsonb,
  vo2max      REAL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============ 2. training_summaries (训练摘要-预处理后) ============
CREATE TABLE IF NOT EXISTS training_summaries (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id       TEXT NOT NULL,
  date             DATE NOT NULL,
  type             TEXT,
  name             TEXT,
  duration_sec     INT DEFAULT 0,
  distance_m       INT DEFAULT 0,
  tss              INT DEFAULT 0,
  if_              REAL DEFAULT 0,
  np               INT DEFAULT 0,
  avg_hr           INT,
  max_hr           INT,
  avg_power        INT,
  max_power        INT,
  hr_zone_dist     JSONB DEFAULT '{}'::jsonb,
  power_zone_dist  JSONB DEFAULT '{}'::jsonb,
  fatigue          REAL,
  form             REAL,
  fitness          REAL,
  injury_flags     JSONB DEFAULT '[]'::jsonb,
  notes            TEXT DEFAULT '',
  raw_activity_id  BIGINT,
  synced_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_athlete_date ON training_summaries(athlete_id, date DESC);

-- ============ 3. weekly_summaries (周汇总) ============
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id         TEXT NOT NULL,
  week_start         DATE NOT NULL,
  week_end           DATE NOT NULL,
  total_tss          INT DEFAULT 0,
  avg_if             REAL DEFAULT 0,
  total_duration_sec BIGINT DEFAULT 0,
  total_distance_m   BIGINT DEFAULT 0,
  activity_count     INT DEFAULT 0,
  avg_fatigue        REAL,
  avg_form           REAL,
  avg_fitness        REAL,
  synced_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ws_athlete_week ON weekly_summaries(athlete_id, week_start DESC);

-- ============ 4. athlete_goals (目标) ============
CREATE TABLE IF NOT EXISTS athlete_goals (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'custom',
  target     REAL NOT NULL,
  unit       TEXT DEFAULT '',
  deadline   DATE,
  progress   REAL DEFAULT 0,
  status     TEXT DEFAULT 'active',
  notes      TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_athlete ON athlete_goals(athlete_id, status);

-- ============ 5. chat_memories (对话记忆) ============
CREATE TABLE IF NOT EXISTS chat_memories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  embedding  vector(1536),
  metadata   JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_session ON chat_memories(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_cm_athlete_time ON chat_memories(athlete_id, created_at DESC);

-- ============ 6. workout_edits (课程编辑记录) ============
CREATE TABLE IF NOT EXISTS workout_edits (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id TEXT NOT NULL,
  workout_id TEXT NOT NULL,
  action     TEXT NOT NULL,
  changes    JSONB DEFAULT '{}'::jsonb,
  status     TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_we_athlete ON workout_edits(athlete_id, created_at DESC);

-- ============ 7. pin_sessions (PIN解锁会话) ============
CREATE TABLE IF NOT EXISTS pin_sessions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id  TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  attempts    INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  last_access TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_athlete ON pin_sessions(athlete_id);

-- ============ 8. memory_summaries (记忆摘要 - Agent记忆系统) ============
CREATE TABLE IF NOT EXISTS memory_summaries (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id TEXT NOT NULL,
  summary    TEXT NOT NULL,
  embedding  vector(1536),
  tags       JSONB DEFAULT '[]'::jsonb,
  source_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ms_athlete ON memory_summaries(athlete_id, created_at DESC);

-- ============ RLS 策略 (允许 service_role 访问，anon 不可直接读写) ============
ALTER TABLE athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summaries ENABLE ROW LEVEL SECURITY;