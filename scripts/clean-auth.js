const fs = require('fs')
const path = require('path')

const file = path.join(process.cwd(), 'app', 'page.js')
let source = fs.readFileSync(file, 'utf8')

function replaceOrFail(label, pattern, replacement) {
  const next = source.replace(pattern, replacement)
  if (next === source) {
    console.error(`Clean auth patch failed: ${label}`)
    process.exit(1)
  }
  source = next
}

replaceOrFail(
  'auth state',
  /  const \[authMode, setAuthMode\] = useState\('signin'\)[\s\S]*?  const \[invite, setInvite\] = useState\(''\)\n/,
`  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
`
)

replaceOrFail(
  'authenticate function',
  /  function normalizePhone\(value\) \{[\s\S]*?\n  async function createPost\(\)/,
`  async function authenticate(e) {
    e.preventDefault()
    setAuthError('')
    setNotice('')
    if (!supabase) return setAuthError('The community service is not configured.')

    const cleanName = name.trim()
    const cleanUsername = normalizeUsername(username)
    if (cleanName.length < 2 || cleanName.length > 80) return setAuthError('Enter your name, 2–80 characters.')
    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return setAuthError('Username must be 3–32 characters using letters, numbers, dot, dash or underscore.')
    if (password.length < 6) return setAuthError('Password must be at least 6 characters.')

    const { data, error } = await supabase.functions.invoke('name-password-auth', {
      body: { name: cleanName, username: cleanUsername, password }
    })
    if (error || !data?.access_token || !data?.refresh_token) {
      return setAuthError(data?.error || error?.message || 'Could not create your profile.')
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    })
    if (sessionError) return setAuthError(sessionError.message)

    setSession(sessionData.session)
    setSelectedProfile(null)
    setTab('profile')
    setNotice('Profile created. Welcome to KL Vibe Tribe!')
  }

  async function createPost()`
)

replaceOrFail(
  'entry screen',
  /function EntryScreen\(p\) \{[\s\S]*?\n\}\n\nfunction Post\(/,
`function EntryScreen(p) {
  return <main className="entry"><div className="entryGlow"/><section className="entryCard"><div className="entryLogo">V</div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>KL Vibe Tribe</h1><p className="tagline">Your campus. Your people. Your vibe.</p><form onSubmit={p.authenticate}><label>Your name<input value={p.name} onChange={e=>p.setName(e.target.value)} placeholder="Your full name" autoComplete="name" autoFocus required /></label><label>Create username<input value={p.username} onChange={e=>p.setUsername(e.target.value)} placeholder="yourhandle" autoCapitalize="none" autoComplete="username" required /></label><label>Password<input type="password" value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" minLength={6} required /></label><p className="joinNote">By joining, you agree to the KL Vibe Tribe community guidelines.</p>{p.authError&&<div className="authError">{p.authError}</div>}{p.notice&&<div className="authNotice">{p.notice}</div>}<button className="primary entryButton">Create my profile</button></form><small className="entryFoot">No Gmail · No email · No phone · No OTP</small></section></main>
}

function Post(`
)

replaceOrFail(
  'entry props',
  /if \(!session\) return <EntryScreen \{\.\.\.\{[\s\S]*?authenticate \}\} \/>/,
`if (!session) return <EntryScreen {...{ name, setName, username, setUsername, password, setPassword, authError, notice, authenticate }} />`
)

source = source.replace(/\n\s*<button className="logout"[\s\S]*?<\/button>/, '')

const cssPath = path.join(process.cwd(), 'app', 'globals.css')
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf8')
  if (!css.includes('.joinNote')) {
    css += `\n\n.joinNote{margin:2px 0 12px;color:#777;font-size:12px;line-height:1.5;text-align:center}.entryFoot{display:block;text-align:center;margin-top:14px;color:#888;font-size:12px}\n`
    fs.writeFileSync(cssPath, css)
  }
}

fs.writeFileSync(file, source)
console.log('Name + username + password auth patch applied.')
