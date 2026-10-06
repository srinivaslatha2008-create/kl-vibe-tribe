'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authMode, setAuthMode] = useState('signin')
  const [loginName, setLoginName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [invite, setInvite] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [authError, setAuthError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('home')
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState([])
  const [liked, setLiked] = useState([])
  const [saved, setSaved] = useState([])
  const [composer, setComposer] = useState('')
  const [activeChat, setActiveChat] = useState(null)
  const [message, setMessage] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [selectedProfile, setSelectedProfile] = useState(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) return
    loadData()
    const pendingInvite = window.localStorage.getItem('kl-vibe-pending-invite')
    if (pendingInvite) {
      supabase.rpc('claim_invite', { invite_code: pendingInvite }).then(() => {
        window.localStorage.removeItem('kl-vibe-pending-invite')
        loadData()
      })
    }
  }, [session])

  async function loadData() {
    const { data: me } = await supabase.from('profiles').select('id,username,display_name,avatar_url,bio,branch,created_at').eq('id', session.user.id).maybeSingle()
    if (me) setProfile(me)

    const { data: postRows, error: postError } = await supabase
      .from('posts')
      .select('id,user_id,caption,media_url,created_at,profiles(id,username,display_name,branch,avatar_url,bio)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!postError) {
      setPosts((postRows || []).map(p => ({
        id: p.id,
        userId: p.user_id,
        name: p.profiles?.display_name || 'Student',
        username: '@' + (p.profiles?.username || 'student'),
        branch: p.profiles?.branch || 'CSE',
        time: relativeTime(p.created_at),
        text: p.caption || '',
        tag: 'Campus',
        likes: 0,
        comments: 0,
        gradient: 'ocean',
        media: p.media_url,
        avatar: p.profiles?.avatar_url || ''
      })))
    }

    const { data: members, error: memberError } = await supabase
      .from('community_members')
      .select('user_id,joined_at,profiles(id,username,display_name,avatar_url,bio,branch,created_at)')
      .order('joined_at', { ascending: false })
      .limit(3000)

    if (!memberError) {
      setPeople((members || []).map(row => {
        const p = row.profiles
        return {
          id: p?.id || row.user_id,
          name: p?.display_name || 'Student',
          username: '@' + (p?.username || 'student'),
          branch: p?.branch || 'CSE',
          bio: p?.bio || 'KL student',
          avatar: p?.avatar_url || '',
          joinedAt: row.joined_at
        }
      }))
    }
  }

  function relativeTime(date) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000))
    if (mins < 60) return `${mins}m`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.round(hours / 24)}d`
  }

  function normalizeUsername(value) {
    return value.trim().toLowerCase().replace(/^@/, '')
  }

  async function authenticate(e) {
    e.preventDefault()
    setAuthError('')
    setNotice('')
    if (!accepted) return setAuthError('Please accept the community guidelines first.')
    if (!supabase) return setAuthError('The community service is not configured.')

    if (authMode === 'signup') {
      const cleanUsername = normalizeUsername(username)
      const cleanName = name.trim()
      if (cleanName.length < 2 || cleanName.length > 80) return setAuthError('Enter your real name, 2–80 characters.')
      if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return setAuthError('Username must be 3–32 characters using letters, numbers, dot, dash or underscore.')
      if (!invite.trim()) return setAuthError('Enter your campus invite code.')
      if (password.length < 6) return setAuthError('Password must be at least 6 characters.')
      if (!email.trim()) return setAuthError('Enter your email for account recovery.')

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: cleanUsername, display_name: cleanName } }
      })
      if (error) {
        const msg = error.message || ''
        if (msg.toLowerCase().includes('display_name') || msg.toLowerCase().includes('duplicate')) return setAuthError('That name or username is already in use. Choose another one.')
        return setAuthError(msg)
      }

      window.localStorage.setItem('kl-vibe-pending-invite', invite.trim())
      if (data.session) {
        const { error: inviteError } = await supabase.rpc('claim_invite', { invite_code: invite.trim() })
        window.localStorage.removeItem('kl-vibe-pending-invite')
        if (inviteError) return setAuthError(inviteError.message)

        // A successful signup already has an authenticated session. Keep that
        // session and let the normal session state render the student's own profile.
        setNotice('Profile created. Welcome to KL Vibe Tribe!')
        setTab('profile')
        setSelectedProfile(null)
        await loadData()
        return
      }

      // If the project requires email confirmation, do not pretend signup failed.
      // Keep the name ready so the student can sign in after confirming the email.
      setNotice('Account created. Please confirm your email, then sign in with your name and password.')
      setLoginName(cleanName)
      setAuthMode('signin')
      return
    }

    const cleanName = loginName.trim()
    if (!cleanName) return setAuthError('Enter your name.')
    if (password.length < 6) return setAuthError('Enter your password.')

    const { data, error } = await supabase.functions.invoke('username-login', {
      body: { name: cleanName, password }
    })
    if (error || !data?.access_token || !data?.refresh_token) {
      return setAuthError(data?.error || 'Name or password is incorrect.')
    }

    const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    if (sessionError) return setAuthError(sessionError.message)
  }

  async function createPost() {
    if (!composer.trim() || !session) return
    const { error } = await supabase.from('posts').insert({ user_id: session.user.id, caption: composer.trim() })
    if (error) return setNotice(error.message)
    setComposer('')
    await loadData()
    setNotice('Posted to your tribe ✨')
  }

  async function openChat(person) {
    setActiveChat(person)
    setChatMessages([])
    if (!supabase || !session || person.id === session.user.id) return
    const { data: conversationId } = await supabase.rpc('get_or_create_dm', { other_user: person.id })
    if (!conversationId) return
    const { data } = await supabase.from('messages').select('id,body,sender_id,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(100)
    if (data) setChatMessages(data)
  }

  async function sendMessage() {
    if (!message.trim() || !activeChat || !session) return
    const { data: conversationId } = await supabase.rpc('get_or_create_dm', { other_user: activeChat.id })
    if (!conversationId) return
    const body = message.trim()
    const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: session.user.id, body })
    if (error) return setNotice(error.message)
    setChatMessages(prev => [...prev, { id: crypto.randomUUID(), body, sender_id: session.user.id, created_at: new Date().toISOString() }])
    setMessage('')
  }

  function showProfile(person) {
    setSelectedProfile(person)
    setTab('profile')
  }

  if (!session) return <EntryScreen {...{ authMode, setAuthMode, loginName, setLoginName, email, setEmail, password, setPassword, name, setName, username, setUsername, invite, setInvite, accepted, setAccepted, authError, notice, authenticate }} />

  const currentName = profile?.display_name || session.user.user_metadata?.display_name || 'Student'
  const currentUsername = profile?.username || session.user.user_metadata?.username || ''
  const myPosts = posts.filter(p => p.userId === session.user.id)
  const viewedProfile = selectedProfile || { id: session.user.id, name: currentName, username: '@' + currentUsername, branch: profile?.branch || 'CSE', bio: profile?.bio || 'KL student', avatar: profile?.avatar_url || '' }
  const viewedPosts = posts.filter(p => p.userId === viewedProfile.id)

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">V</div><div><strong>KL Vibe Tribe</strong><span>Your campus, your vibe.</span></div></div>
      <nav>{[['home','⌂','Home'],['explore','⌕','Explore'],['members','◎','Members'],['messages','◌','Messages'],['saved','♡','Saved'],['profile','◉','Profile']].map(([id,icon,label]) => <button key={id} className={tab===id?'nav active':'nav'} onClick={()=>{setTab(id);if(id==='profile')setSelectedProfile(null)}}><i>{icon}</i>{label}</button>)}</nav>
      <div className="sideCard"><div className="spark">✦</div><strong>Vibe AI</strong><p>Ask about public campus information and community rules.</p><button onClick={()=>setTab('ai')}>Open assistant</button></div>
      <button className="logout" onClick={()=>supabase?.auth.signOut()}>↪ Sign out</button>
    </aside>

    <section className="content">
      <header className="topbar"><div className="mobileBrand"><div className="brandMark">V</div><b>KL Vibe Tribe</b></div><div className="search">⌕ <input placeholder="Search the tribe" /></div><div className="topActions"><button>♡</button><button>◔</button><div className="avatar">{currentName[0]?.toUpperCase()}</div></div></header>

      {tab==='home' && <>
        <div className="hero"><div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>Good morning, {currentName.split(' ')[0]}.</h1><p>@{currentUsername}</p></div><button className="primary" onClick={()=>document.getElementById('composer')?.focus()}>＋ Create post</button></div>
        <div className="stories"><div className="story add"><span>＋</span><small>Your story</small></div>{['Campus','Clubs','Projects','Sports','Study'].map((x,i)=><div className="story" key={x}><div className={`storyRing r${i}`}>{['🎓','🎨','💻','🏆','📚'][i]}</div><small>{x}</small></div>)}</div>
        <div className="layout"><div className="feed"><div className="composer"><div className="avatar">{currentName[0]?.toUpperCase()}</div><textarea id="composer" value={composer} onChange={e=>setComposer(e.target.value)} placeholder="What's happening in your tribe?" /><button onClick={createPost}>Post</button></div>{posts.length ? posts.map(p=><Post key={p.id} post={p} liked={liked.includes(p.id)} saved={saved.includes(p.id)} onLike={()=>setLiked(liked.includes(p.id)?liked.filter(x=>x!==p.id):[...liked,p.id])} onSave={()=>setSaved(saved.includes(p.id)?saved.filter(x=>x!==p.id):[...saved,p.id])} />) : <Empty title="No posts yet" text="Be the first student to share something with the tribe." />}</div><RightRail people={people.filter(p=>p.id!==session.user.id)} onChat={openChat} onProfile={showProfile} /></div>
      </>}
      {tab==='explore' && <Explore posts={posts} />}
      {tab==='members' && <Members people={people} onChat={openChat} onProfile={showProfile} />}
      {tab==='messages' && <Messages people={people} activeChat={activeChat} setActiveChat={openChat} chatMessages={chatMessages} message={message} setMessage={setMessage} sendMessage={sendMessage} currentUserId={session.user.id} />}
      {tab==='saved' && <Empty title="Saved posts" text="Posts you save will appear here." />}
      {tab==='profile' && <Profile person={viewedProfile} posts={viewedPosts} own={viewedProfile.id===session.user.id} />}
      {tab==='ai' && <AI />}
      {notice && <div className="toast" onClick={()=>setNotice('')}>{notice} ×</div>}
    </section>
  </main>
}

function EntryScreen(p) {
  return <main className="entry"><div className="entryGlow"/><section className="entryCard"><div className="entryLogo">V</div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>KL Vibe Tribe</h1><p className="tagline">Your campus. Your people. Your vibe.</p><div className="tabs"><button type="button" className={p.authMode==='signin'?'selected':''} onClick={()=>{p.setAuthMode('signin');p.setAuthError?.('')}}>Sign in</button><button type="button" className={p.authMode==='signup'?'selected':''} onClick={()=>p.setAuthMode('signup')}>Join tribe</button></div><form onSubmit={p.authenticate}>{p.authMode==='signup'&&<><label>Your name<input value={p.name} onChange={e=>p.setName(e.target.value)} placeholder="Your full name" autoComplete="name" /></label><label>Create username<input value={p.username} onChange={e=>p.setUsername(e.target.value)} placeholder="yourhandle" autoCapitalize="none" autoComplete="username" /></label><label>Campus invite code<input value={p.invite} onChange={e=>p.setInvite(e.target.value)} placeholder="KLVIBE26" /></label><label>Email<input type="email" value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label></>} {p.authMode==='signin'&&<label>Your name<input value={p.loginName} onChange={e=>p.setLoginName(e.target.value)} placeholder="Enter the name you joined with" autoComplete="username" required /></label>}<label>Password<input type="password" value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="••••••••" autoComplete={p.authMode==='signin'?'current-password':'new-password'} required /></label><label className="check"><input type="checkbox" checked={p.accepted} onChange={e=>p.setAccepted(e.target.checked)} /> I agree to the community guidelines and understand that private chats are private.</label>{p.authError&&<div className="error">{p.authError}</div>}{p.notice&&<div className="success">{p.notice}</div>}<button className="primary full">{p.authMode==='signup'?'Create my profile':'Sign in'} →</button></form><div className="entryFoot"><span>🔒 Private by design</span><span>•</span><span>Every student gets a separate profile</span></div></section></main>
}

function Post({post,liked,saved,onLike,onSave}) { return <article className="post"><div className="postHead"><div className="avatar">{post.avatar?<img src={post.avatar} alt=""/>:post.name[0]}</div><div><b>{post.name}</b><span>{post.username} · {post.time}</span></div><button className="more">•••</button></div>{post.media?<img className="postMedia" src={post.media} alt="Post"/>:<div className={`postVisual ${post.gradient}`}><span>{post.tag}</span></div>}<p className="postText">{post.text}</p><div className="postMeta"><span>{post.likes + (liked?1:0)} likes</span><span>{post.comments} comments</span></div><div className="postActions"><button className={liked?'on':''} onClick={onLike}>♡ Like</button><button>◌ Comment</button><button>⌁ Share</button><button className={saved?'on':''} onClick={onSave}>♧ Save</button></div></article> }

function RightRail({people,onChat,onProfile}) { return <aside className="rail"><div className="railBlock"><div className="railTitle"><b>Students inside</b><span>{people.length}</span></div>{people.slice(0,5).map(p=><div className="person" key={p.id}><div className="avatar">{p.avatar?<img src={p.avatar} alt=""/>:p.name[0]}</div><div><b>{p.name}</b><span>{p.username}</span></div><button onClick={()=>onChat(p)}>Message</button></div>)}{people.length===0&&<p className="muted">No other students have joined yet.</p>}<button className="textButton" onClick={()=>document.querySelector('[data-members]')?.click()}>See all students →</button></div><div className="railBlock guide"><span className="miniIcon">✦</span><b>Keep the vibe good.</b><p>Be respectful. Share responsibly. Report anything that breaks community rules.</p><button>Community guidelines →</button></div></aside> }

function Explore({posts}) { return <div className="page"><p className="eyebrow">DISCOVER</p><h2>Explore the tribe</h2><p className="muted">Real public posts from students inside the community.</p>{posts.length?<div className="grid">{posts.map(p=><div className="tile" key={p.id}>{p.media?<img className="postMedia" src={p.media} alt=""/>:<div className={`postVisual ${p.gradient}`}><span>{p.tag}</span></div>}<b>{p.name}</b><p>{p.text}</p><small>{p.username} · {p.time}</small></div>)}</div>:<Empty title="Nothing to explore yet" text="Real student posts will appear here after someone shares one."/>}</div> }

function Members({people,onChat,onProfile}) { return <div className="page" data-members-page><p className="eyebrow">WHO'S INSIDE</p><h2>Students inside KL Vibe Tribe</h2><p className="muted">Only students who actually joined the community appear here. No demo users.</p>{people.length?<div className="memberGrid">{people.map(p=><div className="member" key={p.id}><div className="avatar big">{p.avatar?<img src={p.avatar} alt=""/>:p.name[0]}</div><b>{p.name}</b><span>{p.username}</span><small>{p.branch}</small><p>{p.bio}</p><div className="memberActions"><button onClick={()=>onChat(p)}>Message</button><button onClick={()=>onProfile(p)}>Profile</button></div></div>)}</div>:<Empty title="No members yet" text="Students who complete the invite and join flow will appear here."/>}</div> }

function Messages({people,activeChat,setActiveChat,chatMessages,message,setMessage,sendMessage,currentUserId}) { const others=people.filter(p=>p.id!==currentUserId); return <div className="messages"><div className="chatList"><p className="eyebrow">PRIVATE</p><h2>Messages</h2>{others.map(p=><button className={activeChat?.id===p.id?'chatItem active':'chatItem'} key={p.id} onClick={()=>setActiveChat(p)}><div className="avatar">{p.avatar?<img src={p.avatar} alt=""/>:p.name[0]}</div><div><b>{p.name}</b><span>{p.username}</span></div></button>)}{others.length===0&&<p className="muted">No other students to message yet.</p>}</div><div className="chatPane">{activeChat?<><div className="chatHead"><div className="avatar">{activeChat.avatar?<img src={activeChat.avatar} alt=""/>:activeChat.name[0]}</div><div><b>{activeChat.name}</b><span>{activeChat.username}</span></div></div><div className="bubbleArea">{chatMessages.length===0&&<div className="emptyChat">Messages here are private. Vibe AI never reads this chat.</div>}{chatMessages.map(m=><div className={m.sender_id===currentUserId?'bubble mine':'bubble'} key={m.id}>{m.body}</div>)}</div><div className="chatInput"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Write a private message..."/><button onClick={sendMessage}>↑</button></div></>:<div className="emptyChat">Select a real student to start a private conversation.</div>}</div></div> }

function Profile({person,posts,own}) { return <div className="page profilePage"><div className="profileHero"><div className="avatar huge">{person.avatar?<img src={person.avatar} alt=""/>:person.name?.[0]}</div><div><p className="eyebrow">{own?'MY PROFILE':'STUDENT PROFILE'}</p><h2>{person.name}</h2><span>{person.username}</span><p>{person.bio}</p><small>{person.branch} · KL Vibe Tribe</small></div></div><div className="profileStats"><span><b>{posts.length}</b> posts</span><span><b>{own?'You':'Student'}</b> profile</span></div><h3>{own?'My posts':`${person.name}'s posts`}</h3>{posts.length?<div className="feed narrow">{posts.map(p=><Post key={p.id} post={p} liked={false} saved={false} onLike={()=>{}} onSave={()=>{}}/>)}</div>:<Empty title="No posts yet" text={own?'Share something with the tribe.':'This student has not posted anything yet.'}/>}</div> }

function AI() { const [q,setQ]=useState(''); const [answer,setAnswer]=useState(''); const ask=()=>setAnswer(q?`Vibe AI can help with public campus information, community rules, events, study resources and post ideas. Private 1-to-1 messages are not available to me.`:'Try asking about community rules, a public post, an event, or a project idea.'); return <div className="aiPage"><div className="aiOrb">✦</div><p className="eyebrow">VIBE AI</p><h2>Your campus copilot.</h2><p className="muted">Helpful with public community information. Private chats stay private.</p><div className="aiBox"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask Vibe AI about the tribe..."/><button onClick={ask}>Ask</button></div>{answer&&<div className="answer"><b>Vibe AI</b><p>{answer}</p></div>}<div className="suggestions"><button onClick={()=>setQ('What are the community guidelines?')}>Community guidelines</button><button onClick={()=>setQ('Give me ideas for a campus post')}>Post ideas</button><button onClick={()=>setQ('Help me plan a project')}>Project ideas</button></div></div> }

function Empty({title,text}) { return <div className="empty"><div>✦</div><h3>{title}</h3><p>{text}</p></div> }
