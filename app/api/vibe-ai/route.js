import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = 'https://xymeuuqxxnzvzqgqwakj.supabase.co'
const key = 'sb_publishable_K6naqMzxqstYOmsu_6yNpg_UeSalUsz'

export async function POST(request) {
  try {
    const auth = request.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user }, error: authError } = await client.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })

    const body = await request.json()
    const question = String(body?.question || '').trim().slice(0, 500)
    if (!question) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 })

    const lower = question.toLowerCase()
    const rules = 'KL Vibe Tribe is a private campus community. Be respectful, do not harass or impersonate others, do not share private information, and report harmful or inappropriate content.'

    if (lower.includes('rule') || lower.includes('guideline') || lower.includes('safe')) {
      return NextResponse.json({ answer: rules })
    }

    if (lower.includes('what is') && lower.includes('vibe tribe')) {
      return NextResponse.json({ answer: 'KL Vibe Tribe is a private student community for sharing campus posts, discovering other students, and having private 1-to-1 conversations. Vibe AI only uses public community information.' })
    }

    const { data: posts, error } = await client
      .from('posts')
      .select('caption,created_at,profiles(display_name,username)')
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) return NextResponse.json({ answer: 'I can answer questions about community rules and public campus information, but the public feed is unavailable right now.' })

    if (lower.includes('summar') || lower.includes('recent') || lower.includes('post')) {
      const items = (posts || []).filter(p => p.caption).slice(0, 6)
      if (!items.length) return NextResponse.json({ answer: 'There are no public posts available to summarize yet.' })
      const lines = items.map(p => `• ${p.profiles?.display_name || p.profiles?.username || 'Student'}: ${String(p.caption).slice(0, 180)}`)
      return NextResponse.json({ answer: `Here are the latest public posts I can see:\n\n${lines.join('\n')}` })
    }

    const keywords = lower.split(/\W+/).filter(w => w.length > 3).slice(0, 6)
    const matches = (posts || []).filter(p => keywords.some(k => String(p.caption || '').toLowerCase().includes(k)))
    if (matches.length) {
      const lines = matches.slice(0, 5).map(p => `• ${p.profiles?.display_name || p.profiles?.username || 'Student'}: ${String(p.caption).slice(0, 180)}`)
      return NextResponse.json({ answer: `I found these relevant public posts:\n\n${lines.join('\n')}` })
    }

    return NextResponse.json({ answer: 'I can help with public KL Vibe Tribe information, community rules, and public posts. I cannot access or reveal private 1-to-1 messages.' })
  } catch {
    return NextResponse.json({ error: 'Vibe AI is temporarily unavailable.' }, { status: 500 })
  }
}
