// ============ 直接测试 Interval.icu API（绕过 Netlify） ============
// 用法: node test-api.mjs
// 这会用 Supabase 里存的环境变量直接调 interval.icu API

import { createClient } from '@supabase/supabase-js'

// 从 Netlify 环境变量文件读取（本地 fallback: 用 Supabase 的 safe table 查）
async function main() {
  // 尝试从 .env 文件读取（如果存在）
  const env = {}
  try {
    const fs = await import('fs')
    const content = fs.readFileSync('.env', 'utf-8')
    for (const line of content.split('\n')) {
      const [k, ...v] = line.split('=')
      if (k && v.length) env[k.trim()] = v.join('=').trim()
    }
  } catch {}

  const athleteId = env.VITE_ATHLETE_ID || 'i126277'
  const apiKey = env.INTERVAL_ICU_API_KEY || ''

  if (!apiKey) {
    console.log('❌ 未找到 INTERVAL_ICU_API_KEY')
    console.log('请确保 .env 文件中有 INTERVAL_ICU_API_KEY=你的API密钥')
    console.log('或者直接在脚本里设置 apiKey 变量\n')
    process.exit(1)
  }

  const basic = Buffer.from(`API_KEY:${apiKey}`).toString('base64')
  const headers = {
    'Authorization': `Basic ${basic}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }

  console.log('=== 测试间隔.icu API 连通性 ===')
  console.log(`Athlete ID: ${athleteId}`)
  console.log(`API Key (后4位): ...${apiKey.slice(-4)}\n`)

  // Test 1: Profile endpoint
  console.log('--- Test 1: Profile ---')
  try {
    const r1 = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}`, { headers })
    const t1 = await r1.text()
    console.log(`Status: ${r1.status}`)
    console.log(`Content-Type: ${r1.headers.get('content-type')}`)
    console.log(`Body (前 500 字符):`, t1.substring(0, 500))
    console.log(`Is JSON: ${t1.trim().startsWith('{')}\n`)
  } catch (e) {
    console.error('Profile fetch error:', e.message)
  }

  // Test 2: Activities endpoint (recent 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]
  
  console.log(`--- Test 2: Activities (${threeDaysAgo} ~ ${today}) ---`)
  try {
    const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${threeDaysAgo}&newest=${today}`
    const r2 = await fetch(url, { headers })
    const t2 = await r2.text()
    console.log(`Status: ${r2.status}`)
    console.log(`Content-Type: ${r2.headers.get('content-type')}`)
    console.log(`Body length: ${t2.length} chars`)
    console.log(`Body (前 800 字符):`, t2.substring(0, 800))

    if (t2.trim().startsWith('[') || t2.trim().startsWith('{')) {
      const data = JSON.parse(t2)
      if (Array.isArray(data)) {
        console.log(`\n✅ 成功! 返回 ${data.length} 条活动记录`)
        if (data.length > 0) {
          console.log('第1条:', JSON.stringify(data[0], null, 2).substring(0, 600))
        }
      }
    } else {
      console.log('\n❌ 返回的不是 JSON! 可能是 HTML 拦截页')
    }
  } catch (e) {
    console.error('Activities fetch error:', e.message)
  }

  // Test 3: Activities with longer range (30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  
  console.log(`\n--- Test 3: Activities (${thirtyDaysAgo} ~ ${today}) ---`)
  try {
    const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${thirtyDaysAgo}&newest=${today}`
    const r3 = await fetch(url, { headers })
    const t3 = await r3.text()
    console.log(`Status: ${r3.status}`)
    console.log(`Body length: ${t3.length} chars`)

    if (t3.trim().startsWith('[')) {
      const data = JSON.parse(t3)
      if (Array.isArray(data)) {
        console.log(`\n✅ 成功! 返回 ${data.length} 条活动记录`)
      }
    } else {
      console.log(`Body (前 300 字符):`, t3.substring(0, 300))
    }
  } catch (e) {
    console.error('Activities fetch error:', e.message)
  }
}

main().catch(console.error)