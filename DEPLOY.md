# 🚀 骑行AI教练 — 部署指南

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    Deno Deploy                       │
│  ┌───────────────────┐  ┌─────────────────────────┐ │
│  │  静态前端 (SPA)    │  │  API 路由               │ │
│  │  dist/*           │  │  /api/chat              │ │
│  │                   │  │  /api/dashboard         │ │
│  │                   │  │  /api/sync-data         │ │
│  │                   │  │  /api/pin-auth          │ │
│  │                   │  │  /api/workout-edit      │ │
│  │                   │  │  /api/memory-stats      │ │
│  └───────────────────┘  └─────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
  ┌─────────┐   ┌──────────┐   ┌─────────────┐
  │Supabase │   │DeepSeek  │   │interval.icu │
  │(数据库) │   │(AI大模型)│   │(训练数据源) │
  └─────────┘   └──────────┘   └─────────────┘
```

---

## 📦 你的现有资源

| 资源 | 值 | 状态 |
|------|-----|------|
| **Supabase 项目** | `yxenbrhyzitcbjisfffq.supabase.co` | ✅ 已创建 |
| **001_create_tables.sql** | 创建8张表 | ✅ 已运行（但内存表可能失败）|
| **002_fix_rls.sql** | RLS 策略修复 | ✅ 已运行 |
| **GitHub 仓库** | `https://github.com/qwe-0128/ICU_ai_coach.git` | ✅ 已创建 |
| **interval.icu 账号** | athlete_id: `i126277` | ✅ 已有 |
| **API 密钥** | interval.icu + DeepSeek | ⚠️ 需防泄露 |

---

## ⚠️ 安全警告 — 密钥泄露风险

在之前的开发过程中，你的 **Supabase service_role key** 和 **interval.icu API key** 被写入了 `run-migration.mjs` 和 `test-api-direct.mjs` 两个文件。

**好消息**：这两个文件已加入 `.gitignore`，**不会被推送到 GitHub**。

**建议你做**：登录 [supabase.com/dashboard](https://supabase.com/dashboard) → 你的项目 → Settings → API → **Revoke** 当前 service_role key 并 **Generate new secret**。

> 新 key 生成后，你需要更新 `server/.env` 和 Deno Deploy 环境变量。

---

## 🔧 步骤一：Supabase 数据库迁移（必须按顺序执行）

打开 [Supabase SQL Editor](https://supabase.com/dashboard/project/yxenbrhyzitcbjisfffq) → **SQL Editor** → **New Query**

### 迁移 1: 执行 `001_create_tables.sql`（如果已运行可跳过）

<details>
<summary>点击展开 — 已运行过，确认表存在即可</summary>

如果你之前运行过且看到 8 张表创建成功，**无需重新运行**。

验证方法：在 SQL Editor 中运行：
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```
应返回：`athlete_goals, athlete_profiles, chat_memories, memory_summaries, pin_sessions, training_summaries, weekly_summaries, workout_edits`

如果缺少 `chat_memories` 或 `memory_summaries`，说明之前因缺少 `pgvector` 扩展而失败，请跳到**迁移 3**。
</details>

### 迁移 2: 执行 `002_fix_rls.sql`（如果已运行可跳过）

<details>
<summary>点击展开 — 已运行过，确认即可</summary>

验证方法：
```sql
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
```
应返回 8 条 `service_role_all` 策略记录。
</details>

### 迁移 3: ⭐ 执行 `003_enable_pgvector.sql`（重要！）

**这是本次新增的关键迁移**。由于 001 中 `chat_memories` 和 `memory_summaries` 表使用了 `vector(1536)` 类型，需要先启用 `pgvector` 扩展，否则这两张表创建会失败。

打开 `supabase/migrations/003_enable_pgvector.sql`，**复制全部内容**到 Supabase SQL Editor，点击 **Run**。

预期结果：
```
✅ CREATE EXTENSION
✅ CREATE TABLE (chat_memories)  -- 如果不存在则创建
✅ CREATE TABLE (memory_summaries)  -- 如果不存在则创建
✅ RLS + Policy
```

### 迁移 4: 执行 `004_fix_raw_activity_id_type.sql`

这是之前你删除的那个修复脚本。现在改名为 `004`，内容不变。

打开 `supabase/migrations/004_fix_raw_activity_id_type.sql`，复制全部到 SQL Editor，点 **Run**。

```sql
-- 将 raw_activity_id 从 BIGINT 改为 TEXT
-- 因为 interval.icu 的活动 ID 是字符串（如 "i147395284"）
ALTER TABLE training_summaries 
  ALTER COLUMN raw_activity_id TYPE TEXT USING raw_activity_id::TEXT;

CREATE INDEX IF NOT EXISTS idx_ts_raw_activity_id ON training_summaries(raw_activity_id);
```

---

## 🔧 步骤二：配置并推送代码

### 1. 确认代码状态

```bash
# 查看即将提交的变更
git status
```

应包含：
- `M  .gitignore` — 添加了 test 文件排除
- `M  src/lib/api.ts` — API 路径改为相对路径
- `M  vite.config.ts` — 构建配置更新
- `D  netlify.toml` — 删除 netlify 配置
- `D  netlify/functions/*` — 删除旧 serverless 函数
- `?? server/` — 新 Deno 服务端代码
- `?? dist/` — 编译好的前端文件
- `?? supabase/migrations/003_enable_pgvector.sql` — 新迁移
- `?? supabase/migrations/004_fix_raw_activity_id_type.sql` — 重命名的迁移

### 2. 创建 `server/.env`

```bash
# 在 server/ 目录创建 .env 文件
copy server\.env.example server\.env
```

编辑 `server/.env`，填入真实值：
```env
INTERVAL_ICU_ATHLETE_ID=i126277
INTERVAL_ICU_API_KEY=你的interval.icu_API密钥
DEEPSEEK_API_KEY=sk-你的deepseek-api-key
SUPABASE_URL=https://yxenbrhyzitcbjisfffq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的supabase-service-role-key
SESSION_SECRET=随机生成一个至少32字符的字符串
```

> ⚠️ **请尽快轮换你的 Supabase service_role key**（因为之前泄露在本地文件中，虽然不会上传到 GitHub，但安全起见建议更换）

### 3. 提交并推送

```bash
git add .
git commit -m "迁移到 Deno Deploy 全栈部署 + 新增 pgvector 迁移"
git push origin main
```

---

## 🔧 步骤三：Deno Deploy 部署

### 1. 登录 Deno Deploy

访问 [dash.deno.com](https://dash.deno.com)，用你的 GitHub 账号登录（已注册过）。

### 2. 创建新项目

1. 点击 **+ New Project**
2. 选择 **From GitHub** → 连接 `qwe-0128/ICU_ai_coach` 仓库
3. 选择 **main** 分支

### 3. 配置部署参数

| 配置项 | 值 | 说明 |
|--------|-----|------|
| **Name** | `icu-ai-coach`（或自定义）| 项目名 |
| **Entrypoint** | `server/main.ts` | 服务端入口文件 |
| **Framework** | None / Auto | Deno 原生 |

### 4. 配置环境变量 ⭐

在项目 Settings → **Environment Variables** 中添加以下 6 个变量：

| Key | Value | 来源 |
|-----|-------|------|
| `INTERVAL_ICU_ATHLETE_ID` | `i126277` | interval.icu 的运动员 ID |
| `INTERVAL_ICU_API_KEY` | 你的真实 API key | interval.icu → Settings → API Keys |
| `DEEPSEEK_API_KEY` | `sk-你的key` | platform.deepseek.com → API Keys |
| `SUPABASE_URL` | `https://yxenbrhyzitcbjisfffq.supabase.co` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 你的 service_role key | Supabase → Settings → API |
| `SESSION_SECRET` | 随机32+字符 | `openssl rand -hex 32` 生成 |

添加方式：
1. 点击 **Add Variable**
2. Key 和 Value 分别填写
3. 逐个添加完成
4. 点击 **Save**

### 5. 部署

点击 **Deploy** 按钮，Deno Deploy 会：
1. 拉取你的 GitHub 仓库
2. 安装依赖（deno.json 中定义）
3. 启动 `server/main.ts`
4. 分配域名（如 `https://icu-ai-coach-xxxxxxxx.deno.dev`）

等待约 1-2 分钟，部署完成后会显示 ✅ 状态。

---

## 🔧 步骤四：验证部署

### 1. 访问前端
打开浏览器访问 Deno Deploy 分配的域名：
```
https://icu-ai-coach-xxxxxxxx.deno.dev
```

首次访问会弹出 **PIN 码设置**页面 → 输入 4-8 位 PIN → 进入主界面。

### 2. 测试 API
在浏览器开发者工具 Console 中运行：
```js
fetch('/api/dashboard').then(r => r.json()).then(console.log)
```
应返回 JSON（可能为空数据，因为还没同步）。

### 3. 同步数据
在应用内点击 **同步数据** 按钮，后端会从 interval.icu 拉取你的训练数据并存入 Supabase。

---

## 📁 迁移文件完整清单（执行顺序）

| 顺序 | 文件名 | 作用 | 状态 |
|------|--------|------|------|
| 1️⃣ | `001_create_tables.sql` | 创建 8 张核心表 | ✅ 已运行 |
| 2️⃣ | `002_fix_rls.sql` | 修复 RLS 策略 | ✅ 已运行 |
| 3️⃣ | `003_enable_pgvector.sql` | **新增** - 启用 pgvector + 补充建表 | ⚠️ **立即运行** |
| 4️⃣ | `004_fix_raw_activity_id_type.sql` | 修复 raw_activity_id 列类型 | ⚠️ **立即运行** |

---

## 🏠 本地开发

```bash
# 前端开发（热更新）
npm run dev

# 构建前端
npm run build

# 测试 interval.icu API
cd server
deno run --allow-net --allow-env --env-file=.env test-icu.ts
```

---

## 💰 费用估算

| 服务 | 免费额度 | 预计月费 |
|------|----------|----------|
| **Deno Deploy** | 100 万请求/月 + 100 GiB 带宽 | $0 |
| **Supabase** | 500 MB 数据库 + 2 GB 带宽 | $0 |
| **DeepSeek** | 赠送额度 + 极低 API 价格 | ¥5-20/月 |

> 预处理后每次对话约 3000-5000 tokens，月费可控。

---

## 🔐 密钥轮换提醒

**强烈建议**在部署前轮换 Supabase key：
1. [Supabase Dashboard](https://supabase.com/dashboard/project/yxenbrhyzitcbjisfffq) → Settings → API
2. 找到 **service_role key** → 点击 **Revoke**
3. 生成新 key 并更新到 `server/.env` 和 Deno Deploy 环境变量