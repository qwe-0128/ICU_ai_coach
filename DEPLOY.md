# 骑行AI教练 - 部署说明

## 架构概览

```
骑行AI教练 (React PWA + Netlify Functions)
├── 前端: React 19 + TypeScript + TailwindCSS 4 + PWA
├── 后端: Netlify Functions (Serverless)
├── 数据库: Supabase (PostgreSQL + 向量检索)
├── AI: DeepSeek API
└── 数据源: interval.icu API
```

## 部署前准备

### 1. 注册所需服务

| 服务 | 用途 | 注册地址 |
|------|------|----------|
| **Netlify** | 静态部署 + Serverless 函数 | https://netlify.com |
| **Supabase** | PostgreSQL 数据库 + 向量检索 | https://supabase.com |
| **DeepSeek** | AI 对话模型 | https://platform.deepseek.com |
| **interval.icu** | 训练数据源 | https://interval.icu |

### 2. 获取 API 密钥

- **interval.icu**: 登录后进入 Settings → API Keys，获取 Athlete ID 和 API Key
- **DeepSeek**: 登录平台 → API Keys → 创建新密钥
- **Supabase**: 创建项目后 → Settings → API → 获取 `anon public key` 和 `service_role key`

### 3. 配置 Supabase 数据库

在 Supabase Dashboard → SQL Editor 中执行：

```sql
-- 执行 supabase/migrations/001_create_tables.sql 中的所有 SQL
```

### 4. 配置环境变量

在 Netlify Dashboard → Site Settings → Environment Variables 中添加：

| 变量名 | 说明 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL (https://xxx.supabase.co) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (仅用于后端函数) |
| `INTERVAL_ICU_ATHLETE_ID` | interval.icu athlete ID |
| `INTERVAL_ICU_API_KEY` | interval.icu API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key (sk-xxx) |
| `APP_PIN` | 6位数字PIN码（例如 123456） |
| `SESSION_SECRET` | JWT签名密钥（随机字符串，可用 `openssl rand -hex 32` 生成） |

## 部署到 Netlify

### 方法一：通过 Netlify CLI

```bash
# 安装 Netlify CLI
npm install -g netlify-cli

# 登录
netlify login

# 初始化并部署
netlify init
netlify deploy --prod
```

### 方法二：通过 Git 自动部署

1. 将项目推送到 GitHub/GitLab
2. 在 Netlify 中连接仓库
3. 构建设置：
   - Build command: `npm run build`
   - Publish directory: `dist`
4. 配置好环境变量后自动部署

## 功能说明

### PIN 码安全
- 首次使用设置 4-8 位 PIN 码
- 每次打开应用需要 PIN 解锁
- 连续错误多次会锁定

### AI 对话教练
- 基于 14 天训练数据 + 6 周汇总 + 训练目标 + 历史记忆
- 可回答训练相关问题、分析疲劳度、建议恢复策略
- 记忆系统自动总结重要对话

### 数据面板
- 近 14 天训练概览
- 训练负荷趋势
- 心率/功率分布

### 课程管理
- 查看 interval.icu 训练课程
- AI 辅助编辑课程内容
- 同步回 interval.icu

### PWA 支持
- 可添加到手机主屏幕
- 离线缓存静态资源
- 原生应用般体验

## 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量文件并填入实际值
cp .env.example .env

# 启动开发服务器
npm run dev

# 模拟 Netlify Functions（需要 netlify-cli）
netlify dev
```

## Token 消耗优化

- 训练数据预处理为摘要格式，仅包含关键指标
- 对话记忆系统自动过期旧记忆
- 系统提示词精简至约 800 tokens
- 每次对话最大消耗约 2000 tokens