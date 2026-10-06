const fs = require('fs')
const path = require('path')

const file = path.join(process.cwd(), 'app', 'page.js')
let source = fs.readFileSync(file, 'utf8')

function replaceOrFail(label, pattern, replacement) {
  const next = source.replace(pattern, replacement)
  if (next === source) {
    console.error(`Phone auth patch failed: ${label}`)
    process.exit(1)
  }
  source = next
}

replaceOrFail(
  'auth state',
  /  const \[authMode, setAuthMode\] = useState\('signin'\)\n  const \[loginName, setLoginName\] = useState\(''\)\n  const \[email, setEmail\] = useState\(''\)\n  const \[password, setPassword\] = useState\(''\)\n  const \[name, setName\] = useState\(''\)\n  const \[username, setUsername\] = useState\(''\)\n  const \[invite, setInvite\] = useState\(''\)\n/,
`  const [authMode, setAuthMode] = useState('signin')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpBusy, setOtpBusy] = useState(false)
  const [pendingSignup, setPendingSignup] = useState(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [invite, setInvite] = useState('')
`)

replaceOrFail(
  'authenticate function',
  /  async function authenticate\(e\) \{[\s\S]*?\n  \}\n\n  async function createPost\(\)/,
`  function normalizePhone(value) {
    const raw = value.trim().replace(/[\\s()-]/g, '')
    if (/^\\+91\\d{10}$/.test(raw)) return raw
    if (/^91\\d{10}$/.test(raw)) return '+' + raw
    if (/^\\d{10}$/.test(raw)) return '+91' + raw
    return raw
  }

  async function authenticate(e) {
    e.preventDefault()
    setAuthError('')
    setNotice('')
    if (!accepted) return setAuthError('Please accept the community guidelines first.')
    if (!supabase) return setAuthError('The community service is not configured.')

    if (otpSent) {
      const cleanOtp = otp.trim()
      if (!/^\\d{6}$/.test(cleanOtp)) return setAuthError('Enter the 6-digit OTP sent to your phone.')
      setOtpBusy(true)
      const { data, error } = await supabase.auth.verifyOtp({ phone, token: cleanOtp, type: 'sms' })
      setOtpBusy(false)
      if (error) return setAuthError(error.message || 'That OTP is incorrect or expired.')

      setOtpSent(false)
      setOtp('')

      if (pendingSignup) {
        const { error: inviteError } = await supabase.rpc('claim_invite', { invite_code: pendingSignup.invite })
        if (inviteError) {
          await supabase.auth.signOut()
          setPendingSignup(null)
          return setAuthError(inviteError.message)
        }
        setPendingSignup(null)
        setNotice('Profile created. Welcome to KL Vibe Tribe!')
        setTab('profile')
        setSelectedProfile(null)
        if (data?.session) setSession(data.session)
        return
      }

      if (data?.session) setSession(data.session)
      setNotice('Signed in successfully.')
      return
    }

    const cleanPhone = normalizePhone(phone)
    if (!/^\\+\\d{10,15}$/.test(cleanPhone)) return setAuthError('Enter a valid phone number, including country code.')

    if (authMode === 'signup') {
      const cleanUsername = normalizeUsername(username)
      const cleanName = name.trim()
      if (cleanName.length < 2 || cleanName.length > 80) return setAuthError('Enter your real name, 2–80 characters.')
      if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return setAuthError('Username must be 3–32 characters using letters, numbers, dot, dash or underscore.')
      if (!invite.trim()) return setAuthError('Enter your campus invite code.')

      setOtpBusy(true)
      const { error } = await supabase.auth.signInWithOtp({
        phone: cleanPhone,
        options: {
          shouldCreateUser: true,
          data: { username: cleanUsername, display_name: cleanName }
        }
      })
      setOtpBusy(false)
      if (error) return setAuthError(error.message || 'Could not send the OTP.')

      setPhone(cleanPhone)
      setPendingSignup({ invite: invite.trim() })
      setOtpSent(true)
      setOtp('')
      setNotice('OTP sent to ' + cleanPhone + '.')
      return
    }

    setOtpBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      phone: cleanPhone,
      options: { shouldCreateUser: false }
    })
    setOtpBusy(false)
    if (error) return setAuthError(error.message || 'Could not send the OTP.')

    setPhone(cleanPhone)
    setPendingSignup(null)
    setOtpSent(true)
    setOtp('')
    setNotice('OTP sent to ' + cleanPhone + '.')
  }

  async function createPost()`)

replaceOrFail(
  'entry screen',
  /function EntryScreen\(p\) \{[\s\S]*?\n\}\n\nfunction Post\(/,
`function EntryScreen(p) {
  return <main className="entry"><div className="entryGlow"/><section className="entryCard"><div className="entryLogo">V</div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>KL Vibe Tribe</h1><p className="tagline">Your campus. Your people. Your vibe.</p><div className="tabs"><button type="button" className={p.authMode==='signin'?'selected':''} onClick={()=>{p.setAuthMode('signin');p.setAuthError?.('');p.setOtpSent(false);p.setOtp('');p.setPendingSignup(null)}}>Sign in</button><button type="button" className={p.authMode==='signup'?'selected':''} onClick={()=>{p.setAuthMode('signup');p.setAuthError?.('');p.setOtpSent(false);p.setOtp('');p.setPendingSignup(null)}}>Join tribe</button></div><form onSubmit={p.authenticate}>
{!p.otpSent && p.authMode==='signup'&&<><label>Your name<input value={p.name} onChange={e=>p.setName(e.target.value)} placeholder="Your full name" autoComplete="name" /></label><label>Create username<input value={p.username} onChange={e=>p.setUsername(e.target.value)} placeholder="yourhandle" autoCapitalize="none" autoComplete="username" /></label><label>Campus invite code<input value={p.invite} onChange={e=>p.setInvite(e.target.value)} placeholder="KLVIBE26" /></label></>}
{!p.otpSent && <label>Phone number<input type="tel" value={p.phone} onChange={e=>p.setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" inputMode="tel" required /></label>}
{p.otpSent && <div className="otpPanel"><div className="otpIcon">✓</div><h3>Enter your OTP</h3><p>We sent a 6-digit verification code to <strong>{p.phone}</strong>.</p><input className="otpInput" value={p.otp} onChange={e=>p.setOtp(e.target.value.replace(/\\D/g,'').slice(0,6))} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus /></div>}
<label className="check"><input type="checkbox" checked={p.accepted} onChange={e=>p.setAccepted(e.target.checked)} /> <span>I agree to the community guidelines and understand this is a private campus community.</span></label>
{p.authError&&<div className="authError">{p.authError}</div>}{p.notice&&<div className="authNotice">{p.notice}</div>}
<button className="primary entryButton" disabled={p.otpBusy}>{p.otpBusy?'Please wait…':p.otpSent?'Verify OTP':p.authMode==='signup'?'Create my profile':'Send OTP'}</button>
{p.otpSent&&<button type="button" className="textButton" onClick={()=>{p.setOtpSent(false);p.setOtp('');p.setAuthError?.('')}}>← Change phone number</button>}
</form><small className="entryFoot">Phone OTP only · No Gmail · No passwords</small></section></main>
}

function Post(`)

replaceOrFail(
  'entry props',
  /if \(!session\) return <EntryScreen \{\.\.\.\{ authMode, setAuthMode, loginName, setLoginName, email, setEmail, password, setPassword, name, setName, username, setUsername, invite, setInvite, accepted, setAccepted, authError, notice, authenticate \}\} \/>/,
`if (!session) return <EntryScreen {...{ authMode, setAuthMode, phone, setPhone, otp, setOtp, otpSent, setOtpSent, otpBusy, pendingSignup, setPendingSignup, name, setName, username, setUsername, invite, setInvite, accepted, setAccepted, authError, notice, authenticate }} />`)

const cssPath = path.join(process.cwd(), 'app', 'globals.css')
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf8')
  if (!css.includes('.otpPanel')) {
    css += `\n\n/* Phone OTP auth */\n.otpPanel{padding:16px;border:1px solid rgba(0,0,0,.08);border-radius:18px;background:rgba(255,255,255,.72);text-align:center;margin-bottom:14px}.otpIcon{width:38px;height:38px;margin:0 auto 8px;border-radius:50%;display:grid;place-items:center;background:#111;color:#fff}.otpPanel h3{margin:0 0 6px}.otpPanel p{margin:0 0 12px;font-size:13px;line-height:1.5;color:#666}.otpInput{text-align:center;letter-spacing:8px;font-size:24px;font-weight:700}.textButton{display:block;margin:10px auto 0;background:none;border:0;color:#555;cursor:pointer;font:inherit}.entryFoot{display:block;text-align:center;margin-top:14px;color:#888;font-size:12px}\n`
    fs.writeFileSync(cssPath, css)
  }
}

fs.writeFileSync(file, source)
console.log('Phone OTP auth patch applied.')
