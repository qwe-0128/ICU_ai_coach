// 直接用提供的 API 密钥测试 interval.icu
const ATHLETE_ID = 'i126277'
const API_KEY = 'nkzul3msxcffh7hmkzs0p1z3'

const basic = Buffer.from(`API_KEY:${API_KEY}`).toString('base64')
const headers = {
  'Authorization': `Basic ${basic}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
}

async function test() {
  // Test 1: Profile
  console.log('=== Test 1: Profile ===')
  const r1 = await fetch(`https://intervals.icu/api/v1/athlete/${ATHLETE_ID}`, { headers })
  const t1 = await r1.text()
  console.log(`Status: ${r1.status}, Content-Type: ${r1.headers.get('content-type')}`)
  console.log(`Body (前 300 字符): ${t1.substring(0, 300)}`)
  console.log(`Is JSON: ${t1.trim().startsWith('{')}\n`)

  // Test 2: Activities (recent 3 days)
  console.log('=== Test 2: Activities (2026-05-10 ~ 2026-05-13) ===')
  const r2 = await fetch(
    `https://intervals.icu/api/v1/athlete/${ATHLETE_ID}/activities?oldest=2026-05-10&newest=2026-05-13`,
    { headers }
  )
  const t2 = await r2.text()
  console.log(`Status: ${r2.status}, Content-Type: ${r2.headers.get('content-type')}`)
  console.log(`Body length: ${t2.length} 字符`)
  console.log(`Body (前 500 字符): ${t2.substring(0, 500)}`)
  
  if (t2.trim().startsWith('[')) {
    const arr = JSON.parse(t2)
    console.log(`\n✅ 返回 ${arr.length} 条活动记录`)
    if (arr.length > 0) {
      console.log('第1条 keys:', Object.keys(arr[0]).slice(0, 15).join(', '))
      console.log('第1条:', JSON.stringify(arr[0]).substring(0, 500))
    }
  } else {
    console.log(`\n❌ 非JSON数组响应`)
  }
}

test().catch(e => console.error('Error:', e.message))