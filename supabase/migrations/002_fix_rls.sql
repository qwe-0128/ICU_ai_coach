-- ============ 修复 RLS 策略 ============
-- 001 中只启用了 RLS 但没有创建策略，导致连 service_role 也可能受限

-- Allow all access via service_role (bypass RLS) - idempotent
DROP POLICY IF EXISTS service_role_all ON athlete_profiles;
CREATE POLICY service_role_all ON athlete_profiles FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON training_summaries;
CREATE POLICY service_role_all ON training_summaries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON weekly_summaries;
CREATE POLICY service_role_all ON weekly_summaries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON athlete_goals;
CREATE POLICY service_role_all ON athlete_goals FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON chat_memories;
CREATE POLICY service_role_all ON chat_memories FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON workout_edits;
CREATE POLICY service_role_all ON workout_edits FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON pin_sessions;
CREATE POLICY service_role_all ON pin_sessions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON memory_summaries;
CREATE POLICY service_role_all ON memory_summaries FOR ALL USING (true) WITH CHECK (true);
