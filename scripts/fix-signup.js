const fs = require('fs')
const path = require('path')

const file = path.join(process.cwd(), 'app', 'page.js')
let source = fs.readFileSync(file, 'utf8')

const old = `      window.localStorage.setItem('kl-vibe-pending-invite', invite.trim())
      if (data.session) {
        await supabase.rpc('claim_invite', { invite_code: invite.trim() })
        window.localStorage.removeItem('kl-vibe-pending-invite')
      }
      setNotice(data.session ? 'Account created. Welcome to KL Vibe Tribe.' : 'Account created. Confirm your email, then sign in with your name and password.')
      setLoginName(cleanName)
      setAuthMode('signin')
      return
`

const replacement = `      window.localStorage.setItem('kl-vibe-pending-invite', invite.trim())
      if (data.session) {
        const { error: inviteError } = await supabase.rpc('claim_invite', { invite_code: invite.trim() })
        window.localStorage.removeItem('kl-vibe-pending-invite')
        if (inviteError) return setAuthError(inviteError.message)

        // The new account already has an authenticated session. Keep it and open the student's own profile.
        setNotice('Profile created. Welcome to KL Vibe Tribe!')
        setTab('profile')
        setSelectedProfile(null)
        await loadData()
        return
      }

      // Email confirmation may be required by the Supabase project.
      setNotice('Account created. Please confirm your email, then sign in with your name and password.')
      setLoginName(cleanName)
      setAuthMode('signin')
      return
`

if (source.includes(replacement)) {
  console.log('Signup redirect patch already present.')
  process.exit(0)
}

if (!source.includes(old)) {
  console.error('Signup block not found; refusing to modify the file.')
  process.exit(1)
}

source = source.replace(old, replacement)
fs.writeFileSync(file, source)
console.log('Signup redirect patch applied.')
