-- ============ 启用 pgvector 扩展 + 补充创建缺失的表 ============
-- 如果 001 执行时 pgvector 未启用，chat_memories 和 memory_summaries 会创建失败
-- 此脚本修复该问题

-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 如果 chat_memories 表不存在则创建（001 中因缺少 vector 扩展可能失败）
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

-- 3. 如果 memory_summaries 表不存在则创建
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

-- 4. 确保这两张表的 RLS 策略存在（002 中已有，但以防万一）
ALTER TABLE chat_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON chat_memories;
CREATE POLICY service_role_all ON chat_memories FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON memory_summaries;
CREATE POLICY service_role_all ON memory_summaries FOR ALL USING (true) WITH CHECK (true);