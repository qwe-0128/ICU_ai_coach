#!/usr/bin/env -S deno run --allow-net --allow-env
// @ts-nocheck
// ============ ICU API Availability Test ============
// Usage: deno run --allow-net --allow-env test-icu.ts
// 检查 server/.env 中的 INTERVAL_ICU_API_KEY 和 INTERVAL_ICU_ATHLETE_ID

async function main() {
  const apiKey = Deno.env.get('INTERVAL_ICU_API_KEY')
  const athleteId = Deno.env.get('INTERVAL_ICU_ATHLETE_ID')

  if (!apiKey || !athleteId) {
    // Try loading .env via --env-file flag (Deno 1.38+)
    console.error('❌ 缺少环境变量。请通过以下方式设置：')
    console.error('   deno run --allow-net --allow-env --env-file=.env test-icu.ts')
    console.error('   INTERVAL_ICU_API_KEY=xxx  INTERVAL_ICU_ATHLETE_ID=123')
    Deno.exit(1)
  }

  const basic = btoa(`API_KEY:${apiKey}`)
  const headers = {
    'Authorization': `Basic ${basic}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  console.log(`\n🔍 Testing interval.icu API...`)
  console.log(`   Athlete ID: ${athleteId}`)

  // Test 1: Get profile (most basic endpoint)
  console.log(`\n1. GET /api/v1/athlete/${athleteId} (Profile)...`)
  try {
    const resp = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}`, { headers })
    console.log(`   Status: ${resp.status} ${resp.statusText}`)
    const text = await resp.text()
    const preview = text.substring(0, 300)
    console.log(`   Body preview: ${preview}`)
    if (!resp.ok) {
      console.error(`   ❌ Profile endpoint failed!`)
    } else {
      try {
        const json = JSON.parse(text)
        console.log(`   ✅ Profile OK. Keys: ${Object.keys(json).slice(0, 10).join(', ')}`)
        console.log(`      Name: ${json.name || json.athlete_name || 'N/A'}`)
        console.log(`      FTP: ${json.ftp || 'N/A'} | Weight: ${json.weight || 'N/A'}`)
      } catch {
        console.log(`   ⚠️ Response is not JSON (may need Basic auth adjustment)`)
      }
    }
  } catch (e) {
    console.error(`   ❌ Network error: ${e.message}`)
  }

  // Test 2: Activities (recent)
  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0]
  console.log(`\n2. GET /api/v1/athlete/${athleteId}/activities?oldest=${thirtyDaysAgo}&newest=${today}...`)
  try {
    const resp = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${thirtyDaysAgo}&newest=${today}`, { headers })
    console.log(`   Status: ${resp.status} ${resp.statusText}`)
    const text = await resp.text()
    const preview = text.substring(0, 200)
    console.log(`   Body preview: ${preview}`)
    if (!resp.ok) {
      console.error(`   ❌ Activities endpoint failed!`)
    } else {
      try {
        const json = JSON.parse(text)
        console.log(`   ✅ Activities OK. Count: ${json.length}`)
        if (json.length > 0) {
          const first = json[0]
          console.log(`   First activity: ${first.name || 'Unnamed'} | ${first.type || '?'} | TSS:${first.icu_training_load || 0}`)
        }
      } catch {
        console.log(`   ⚠️ Response is not JSON`)
      }
    }
  } catch (e) {
    console.error(`   ❌ Network error: ${e.message}`)
  }

  // Test 3: Wellness
  console.log(`\n3. GET /api/v1/athlete/${athleteId}/wellness?oldest=${thirtyDaysAgo}&newest=${today}...`)
  try {
    const resp = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${thirtyDaysAgo}&newest=${today}`, { headers })
    console.log(`   Status: ${resp.status} ${resp.statusText}`)
    const text = await resp.text()
    console.log(`   Body preview: ${text.substring(0, 150)}`)
    if (!resp.ok) {
      console.log(`   ⚠️ Wellness endpoint may not be available (needs specific permission?)`)
    } else {
      try {
        const json = JSON.parse(text)
        console.log(`   ✅ Wellness OK. Count: ${json.length}`)
      } catch {
        console.log(`   ⚠️ Response is not JSON`)
      }
    }
  } catch (e) {
    console.log(`   ⚠️ Network error: ${e.message}`)
  }

  // Test 4: Workouts endpoint (for editing)
  console.log(`\n4. GET /api/v1/athlete/${athleteId}/workouts (Workouts for editing)...`)
  try {
    const resp = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/workouts`, { headers })
    console.log(`   Status: ${resp.status} ${resp.statusText}`)
    const text = await resp.text()
    console.log(`   Body preview: ${text.substring(0, 200)}`)
    if (resp.ok) {
      try {
        const json = JSON.parse(text)
        console.log(`   ✅ Workouts OK. Count: ${json.length}`)
      } catch {
        console.log(`   ⚠️ Response is not JSON`)
      }
    } else {
      console.log(`   ⚠️ Workouts endpoint returned ${resp.status}`)
    }
  } catch (e) {
    console.log(`   ⚠️ Network error: ${e.message}`)
  }

  console.log(`\n✅ ICU API 测试完成！`)
}

main()