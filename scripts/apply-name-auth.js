const fs = require('fs')
const path = require('path')

const file = path.join(process.cwd(), 'app', 'page.js')
let source = fs.readFileSync(file, 'utf8')

if (!source.includes("const [name, setName] = useState('')")) {
  source = source.replace(
    "  const [profile, setProfile] = useState(null)\n  const [username, setUsername] = useState('')",
    "  const [profile, setProfile] = useState(null)\n  const [name, setName] = useState('')\n  const [username, setUsername] = useState('')"
  )
}

source = source.replace(
  /  async function authenticate\(e\) \{[\s\S]*?\n  \}\n\n  async function createPost\(\)/,
`  async function authenticate(e) {
    e.preventDefault()
    setAuthError('')
    setNotice('')
    const cleanName = name.trim()
    const cleanUsername = normalizeUsername(username)
    if (cleanName.length < 2 || cleanName.length > 80) return setAuthError('Enter your name, 2–80 characters.')
    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return setAuthError('Username must be 3–32 characters using letters, numbers, dot, dash or underscore.')
    if (password.length < 6) return setAuthError('Password must be at least 6 characters.')

    const { data, error } = await supabase.functions.invoke('name-password-auth', {
      body: { name: cleanName, username: cleanUsername, password }
    })
    if (error || !data?.access_token || !data?.refresh_token) {
      return setAuthError(data?.error || error?.message || 'Could not create your profile. Try another username.')
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    })
    if (sessionError) return setAuthError(sessionError.message)
    setName('')
    setUsername('')
    setPassword('')
    setNotice('Profile created. Welcome to KL Vibe Tribe!')
    setTab('home')
    setSelectedProfile(null)
  }

  async function createPost()`
)

source = source.replace(
  /if \(!session\) return <EntryScreen[^\n]*\/>/,
  "if (!session) return <EntryScreen name={name} setName={setName} username={username} setUsername={setUsername} password={password} setPassword={setPassword} authError={authError} notice={notice} authenticate={authenticate} />"
)

source = source.replace(
  /function EntryScreen\(\{username,setUsername,password,setPassword,authError,notice,authenticate\}\) \{[\s\S]*?\n\}/,
`function EntryScreen({name,setName,username,setUsername,password,setPassword,authError,notice,authenticate}) {
  return <main className="entry"><div className="entryGlow"/><section className="entryCard"><div className="entryLogo">V</div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>KL Vibe Tribe</h1><p className="tagline">Your campus. Your people. Your vibe.</p><div className="joinBadge">✦ Your campus. Your people. Your vibe.</div><form onSubmit={authenticate}><label>Your name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" autoComplete="name" autoFocus required /></label><label>Create username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="yourhandle" autoCapitalize="none" autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" minLength={6} required /></label>{authError&&<div className="error">{authError}</div>}{notice&&<div className="success">{notice}</div>}<button className="primary full">Create my profile →</button></form><div className="entryFoot"><span>🔒 Private campus community</span><span>•</span><span>No email · No phone · No OTP</span></div></section></main>
}`
)

fs.writeFileSync(file, source)
console.log('KL Vibe Tribe: name + username + password entry flow applied.')
