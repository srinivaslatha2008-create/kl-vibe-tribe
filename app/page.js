'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('signin')
  const [loginUsername, setLoginUsername] = useState('')
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
    const { data: postRows, error: postError } = await supabase
      .from('posts')
      .select('id,caption,media_url,created_at,profiles(id,username,display_name,branch)')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!postError) {
      setPosts((postRows || []).map(p => ({
        id: p.id,
        name: p.profiles?.display_name || 'Student',
        username: '@' + (p.profiles?.username || 'student'),
        time: relativeTime(p.created_at),
        text: p.caption || '',
        tag: 'Campus',
        likes: 0,
        comments: 0,
        gradient: 'ocean',
        media: p.media_url
      })))
    }

    const { data: members, error: memberError } = await supabase
      .from('community_members')
      .select('user_id,profiles(id,username,display_name,branch)')
      .order('joined_at', { ascending: false })
      .limit(100)

    if (!memberError) {
      setPeople((members || []).map(row => {
        const p = row.profiles
        return {
          id: p?.id || row.user_id,
          name: p?.display_name || 'Student',
          username: '@' + (p?.username || 'student'),
          branch: p?.branch || 'CSE',
          online: false
        }
      }))
    }
  }

  function relativeTime(date) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000))
    return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`
  }

  function normalizeUsername(value) {
    return value.trim().toLowerCase().replace(/^@/, '')
  }

  async function authenticate(e) {
    e.preventDefault()
    setAuthError('')
    setNotice('')
    if (!accepted) return setAuthError('Please accept the community guidelines first.')
    if (!supabase) return setAuthError('Supabase is not configured yet.')

    if (authMode === 'signup') {
      const cleanUsername = normalizeUsername(username)
      if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return setAuthError('Username must be 3–32 characters using letters, numbers, dot, dash or underscore.')
      if (!name.trim()) return setAuthError('Enter your name.')
      if (!invite.trim()) return setAuthError('Enter your campus invite code.')
      if (password.length < 6) return setAuthError('Password must be at least 6 characters.')

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: cleanUsername, display_name: name.trim() } }
      })
      if (error) return setAuthError(error.message)

      window.localStorage.setItem('kl-vibe-pending-invite', invite.trim())
      if (data.session) {
        await supabase.rpc('claim_invite', { invite_code: invite.trim() })
        window.localStorage.removeItem('kl-vibe-pending-invite')
      }
      setNotice(data.session ? 'You joined KL Vibe Tribe.' : 'Account created. Confirm your email, then sign in with your username.')
      setLoginUsername(cleanUsername)
      setAuthMode('signin')
      return
    }

    const cleanUsername = normalizeUsername(loginUsername)
    if (!cleanUsername) return setAuthError('Enter your username.')

    const { data, error } = await supabase.functions.invoke('username-login', {
      body: { username: cleanUsername, password }
    })
    if (error || !data?.access_token || !data?.refresh_token) {
      return setAuthError(data?.error || 'Invalid username or password.')
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    })
    if (sessionError) return setAuthError(sessionError.message)
  }

  async function createPost() {
    if (!composer.trim() || !session) return
    const { error } = await supabase.from('posts').insert({ user_id: session.user.id, caption: composer.trim() })
    if (error) return setNotice(error.message)
    setComposer('')
    await loadData()
    setNotice('Posted to the tribe ✨')
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
    if (conversationId) {
      const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: session.user.id, body: message.trim() })
      if (!error) {
        setChatMessages([...chatMessages, { id: crypto.randomUUID(), body: message.trim(), sender_id: session.user.id, created_at: new Date().toISOString() }])
        setMessage('')
      }
    }
  }

  if (!session) return <EntryScreen {...{ authMode, setAuthMode, loginUsername, setLoginUsername, email, setEmail, password, setPassword, name, setName, username, setUsername, invite, setInvite, accepted, setAccepted, authError, notice, authenticate }} />

  const currentName = session.user.user_metadata?.display_name || 'Student'
  const currentUsername = session.user.user_metadata?.username || ''

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">V</div><div><strong>KL Vibe Tribe</strong><span>Your campus, your vibe.</span></div></div>
      <nav>{[['home','⌂','Home'],['explore','⌕','Explore'],['members','◎','Members'],['messages','◌','Messages'],['saved','♡','Saved'],['profile','◉','Profile']].map(([id,icon,label]) => <button key={id} className={tab===id?'nav active':'nav'} onClick={()=>setTab(id)}><i>{icon}</i>{label}</button>)}</nav>
      <div className="sideCard"><div className="spark">✦</div><strong>Vibe AI</strong><p>Ask about campus rules, public posts, events or ideas.</p><button onClick={()=>setTab('ai')}>Open assistant</button></div>
      <button className="logout" onClick={()=>supabase?.auth.signOut()}>↪ Sign out</button>
    </aside>

    <section className="content">
      <header className="topbar"><div className="mobileBrand"><div className="brandMark">V</div><b>KL Vibe Tribe</b></div><div className="search">⌕ <input placeholder="Search the tribe" /></div><div className="topActions"><button>♡</button><button>◔</button><div className="avatar">{currentName[0]?.toUpperCase()}</div></div></header>

      {tab==='home' && <>
        <div className="hero"><div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>Good morning, {currentName.split(' ')[0]}.</h1><p>{currentUsername ? '@' + currentUsername : 'Your campus, your people, your vibe.'}</p></div><button className="primary" onClick={()=>document.getElementById('composer')?.focus()}>＋ Create post</button></div>
        <div className="stories"><div className="story add"><span>＋</span><small>Your story</small></div>{['Campus','Clubs','Projects','Sports','Study'].map((x,i)=><div className="story" key={x}><div className={`storyRing r${i}`}>{['🎓','🎨','💻','🏆','📚'][i]}</div><small>{x}</small></div>)}</div>
        <div className="layout"><div className="feed"><div className="composer"><div className="avatar">{currentName[0]?.toUpperCase()}</div><textarea id="composer" value={composer} onChange={e=>setComposer(e.target.value)} placeholder="What's happening in your tribe?" /><button onClick={createPost}>Post</button></div>{posts.length ? posts.map(p=><Post key={p.id} post={p} liked={liked.includes(p.id)} saved={saved.includes(p.id)} onLike={()=>setLiked(liked.includes(p.id)?liked.filter(x=>x!==p.id):[...liked,p.id])} onSave={()=>setSaved(saved.includes(p.id)?saved.filter(x=>x!==p.id):[...saved,p.id])} />) : <Empty title="No posts yet" text="You're early. Be the first student to share something with the tribe." />}</div><RightRail people={people} onChat={openChat} /></div>
      </>}
      {tab==='explore' && <Explore posts={posts} />}
      {tab==='members' && <Members people={people} onChat={openChat} />}
      {tab==='messages' && <Messages people={people} activeChat={activeChat} setActiveChat={openChat} chatMessages={chatMessages} message={message} setMessage={setMessage} sendMessage={sendMessage} currentUserId={session.user.id} />}
      {tab==='saved' && <Empty title="Saved posts" text="Posts you save will appear here." />}
      {tab==='profile' && <Profile name={currentName} username={currentUsername} email={session.user.email} posts={posts.filter(p=>p.username==='@'+currentUsername)} />}
      {tab==='ai' && <AI />}
      {notice && <div className="toast" onClick={()=>setNotice('')}>{notice} ×</div>}
    </section>
  </main>
}

function EntryScreen(p) {
  return <main className="entry"><div className="entryGlow"/><section className="entryCard"><div className="entryLogo">V</div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>KL Vibe Tribe</h1><p className="tagline">Your campus. Your people. Your vibe.</p><div className="tabs"><button className={p.authMode==='signin'?'selected':''} onClick={()=>p.setAuthMode('signin')}>Sign in</button><button className={p.authMode==='signup'?'selected':''} onClick={()=>p.setAuthMode('signup')}>Join tribe</button></div><form onSubmit={p.authenticate}>{p.authMode==='signup'&&<><label>Name<input value={p.name} onChange={e=>p.setName(e.target.value)} placeholder="Your name" /></label><label>Username<input value={p.username} onChange={e=>p.setUsername(e.target.value)} placeholder="yourhandle" autoCapitalize="none" /></label><label>Campus invite code<input value={p.invite} onChange={e=>p.setInvite(e.target.value)} placeholder="Invite code" /></label><label>Email<input type="email" value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="you@kluniversity.in" required /></label></>} {p.authMode==='signin'&&<label>Username<input value={p.loginUsername} onChange={e=>p.setLoginUsername(e.target.value)} placeholder="@yourhandle" autoCapitalize="none" required /></label>}<label>Password<input type="password" value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="••••••••" required /></label><label className="check"><input type="checkbox" checked={p.accepted} onChange={e=>p.setAccepted(e.target.checked)} /> I agree to the community guidelines and understand that private chats are private.</label>{p.authError&&<div className="error">{p.authError}</div>}{p.notice&&<div className="success">{p.notice}</div>}<button className="primary full">{p.authMode==='signup'?'Join the tribe':'Sign in'} →</button></form><div className="entryFoot"><span>🔒 Private by design</span><span>•</span><span>Only joined students appear in Members</span></div></section></main>
}

function Post({post,liked,saved,onLike,onSave}) { return <article className="post"><div className="postHead"><div className="avatar">{post.name[0]}</div><div><b>{post.name}</b><span>{post.username} · {post.time}</span></div><button className="more">•••</button></div>{post.media?<img className="postMedia" src={post.media} alt="Post"/>:<div className={`postVisual ${post.gradient}`}><span>{post.tag}</span></div>}<p className="postText">{post.text}</p><div className="postMeta"><span>{post.likes + (liked?1:0)} likes</span><span>{post.comments} comments</span></div><div className="postActions"><button className={liked?'on':''} onClick={onLike}>♡ Like</button><button>◌ Comment</button><button>⌁ Share</button><button className={saved?'on':''} onClick={onSave}>♧ Save</button></div></article> }
function RightRail({people,onChat}) { return <aside className="rail"><div className="railBlock"><div className="railTitle"><b>Students inside</b><span>{people.length}</span></div>{people.slice(0,4).map(p=><div className="person" key={p.id}><div className="avatar">{p.name[0]}</div><div><b>{p.name}</b><span>{p.username}</span></div><button onClick={()=>onChat(p)}>Message</button></div>)}{people.length===0&&<p className="muted">No other students have joined yet.</p>}</div><div className="railBlock guide"><span className="miniIcon">✦</span><b>Keep the vibe good.</b><p>Be respectful. Share responsibly. Report anything that breaks community rules.</p><button>Community guidelines →</button></div></aside> }
function Explore({posts}) { return <div className="page"><p className="eyebrow">DISCOVER</p><h2>Explore the tribe</h2><p className="muted">Public posts from students who are actually inside the community.</p>{posts.length?<div className="grid">{posts.map(p=><div className="tile" key={p.id}><div className={`postVisual ${p.gradient}`}><span>{p.tag}</span></div><b>{p.text}</b><small>{p.likes} likes · {p.comments} comments</small></div>)}</div>:<Empty title="Nothing to explore yet" text="Real student posts will appear here after someone shares one."/>}</div> }
function Members({people,onChat}) { return <div className="page"><p className="eyebrow">WHO'S INSIDE</p><h2>Students inside KL Vibe Tribe</h2><p className="muted">This list is connected to the real community database. No demo names.</p>{people.length?<div className="memberGrid">{people.map(p=><div className="member" key={p.id}><div className="avatar big">{p.name[0]}</div><b>{p.name}</b><span>{p.username}</span><small>{p.branch}</small><button onClick={()=>onChat(p)}>Message</button></div>)}</div>:<Empty title="No members yet" text="Students who complete the invite and join flow will appear here."/>}</div> }
function Messages({people,activeChat,setActiveChat,chatMessages,message,setMessage,sendMessage,currentUserId}) { return <div className="messages"><div className="chatList"><p className="eyebrow">PRIVATE</p><h2>Messages</h2>{people.filter(p=>p.id!==currentUserId).map(p=><button className={activeChat?.id===p.id?'chatItem active':'chatItem'} key={p.id} onClick={()=>setActiveChat(p)}><div className="avatar">{p.name[0]}</div><div><b>{p.name}</b><span>{p.username}</span></div></button>)}{people.filter(p=>p.id!==currentUserId).length===0&&<p className="muted">No other students to message yet.</p>}</div><div className="chatPane">{activeChat?<><div className="chatHead"><div className="avatar">{activeChat.name[0]}</div><div><b>{activeChat.name}</b><span>{activeChat.username}</span></div></div><div className="bubbleArea">{chatMessages.length===0&&<div className="emptyChat">Messages here are private. Vibe AI never reads this chat.</div>}{chatMessages.map(m=><div className={m.sender_id===currentUserId?'bubble mine':'bubble'} key={m.id}>{m.body}</div>)}</div><div className="chatInput"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Write a private message..."/><button onClick={sendMessage}>↑</button></div></>:<div className="emptyChat">Select a real student to start a private conversation.</div>}</div></div> }
function Profile({name,username,email,posts}) { return <div className="page profilePage"><div className="profileHero"><div className="avatar huge">{name[0]}</div><div><p className="eyebrow">MY PROFILE</p><h2>{name}</h2><span>@{username}</span><p>KL student · Building, learning and vibing.</p></div><button className="secondary">Edit profile</button></div><h3>My posts</h3>{posts.length?<div className="feed narrow">{posts.map(p=><Post key={p.id} post={p} liked={false} saved={false} onLike={()=>{}} onSave={()=>{}}/>)}</div>:<Empty title="No posts yet" text="Share something with the tribe."/>}</div> }
function AI() { const [q,setQ]=useState(''); const [answer,setAnswer]=useState(''); const ask=()=>{setAnswer(q?`Vibe AI can help with public campus information, community rules, events, study resources and post ideas. I won't access or summarize private 1-to-1 messages.`:'Try asking about community rules, a public post, an event, or a project idea.')}; return <div className="aiPage"><div className="aiOrb">✦</div><p className="eyebrow">VIBE AI</p><h2>Your campus copilot.</h2><p className="muted">Helpful with public community information. Private chats stay private.</p><div className="aiBox"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask Vibe AI anything about the tribe..."/><button onClick={ask}>Ask</button></div>{answer&&<div className="answer"><b>Vibe AI</b><p>{answer}</p></div>}<div className="suggestions"><button onClick={()=>setQ('What are the community guidelines?')}>Community guidelines</button><button onClick={()=>setQ('Give me ideas for a campus post')}>Post ideas</button><button onClick={()=>setQ('Help me plan a project')}>Project ideas</button></div></div> }
function Empty({title,text}) { return <div className="empty"><div>✦</div><h3>{title}</h3><p>{text}</p></div> }