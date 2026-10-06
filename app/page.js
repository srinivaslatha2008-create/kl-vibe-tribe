'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const demoPeople = [
  { id: '1', name: 'Aarav', username: '@aarav', branch: 'CSE', online: true },
  { id: '2', name: 'Saanvi', username: '@saanvi', branch: 'AI & ML', online: true },
  { id: '3', name: 'Rohit', username: '@rohit', branch: 'ECE', online: false },
  { id: '4', name: 'Meera', username: '@meera', branch: 'CSE', online: true }
]

const demoPosts = [
  { id: 'p1', name: 'Saanvi', username: '@saanvi', time: '18 min', text: 'Anyone joining the coding club meetup today? 👀', tag: 'Campus', likes: 84, comments: 12, gradient: 'sunset' },
  { id: 'p2', name: 'Rohit', username: '@rohit', time: '1 hr', text: 'Found a great quiet spot near the library for project work. Sharing it with the tribe 📚', tag: 'Study', likes: 51, comments: 7, gradient: 'ocean' },
  { id: 'p3', name: 'Meera', username: '@meera', time: '3 hr', text: 'Hackathon team — we still need one frontend person. DM if you want in.', tag: 'Projects', likes: 39, comments: 9, gradient: 'lavender' }
]

export default function Home() {
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [invite, setInvite] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [authError, setAuthError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('home')
  const [posts, setPosts] = useState(demoPosts)
  const [people, setPeople] = useState(demoPeople)
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
  }, [session])

  async function loadData() {
    const { data, error } = await supabase.from('posts').select('id,caption,media_url,created_at,profiles(id,username,display_name,branch)').order('created_at', { ascending: false }).limit(30)
    if (!error && data?.length) {
      setPosts(data.map(p => ({ id: p.id, name: p.profiles?.display_name || 'Student', username: '@' + (p.profiles?.username || 'student'), time: relativeTime(p.created_at), text: p.caption || '', tag: 'Campus', likes: 0, comments: 0, gradient: 'ocean', media: p.media_url })))
    }
    const { data: members } = await supabase.from('profiles').select('id,username,display_name,branch').limit(50)
    if (members?.length) setPeople(members.map(p => ({ id: p.id, name: p.display_name || 'Student', username: '@' + (p.username || 'student'), branch: p.branch || 'CSE', online: false })))
  }

  function relativeTime(date) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000))
    return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`
  }

  async function authenticate(e) {
    e.preventDefault(); setAuthError(''); setNotice('')
    if (!accepted) return setAuthError('Please accept the community guidelines first.')
    if (!supabase) return setAuthError('Supabase is not configured yet. Add the project environment variables in Vercel.')
    if (authMode === 'signup') {
      if (!invite.trim()) return setAuthError('Enter your campus invite code.')
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username, display_name: name } } })
      if (error) return setAuthError(error.message)
      if (data.user) await supabase.rpc('claim_invite', { invite_code: invite.trim() }).catch(() => {})
      setNotice('Account created. Check your email if confirmation is enabled, then sign in.')
      setAuthMode('signin')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setAuthError(error.message)
    }
  }

  async function createPost() {
    if (!composer.trim()) return
    if (supabase && session) {
      const { error } = await supabase.from('posts').insert({ user_id: session.user.id, caption: composer.trim() })
      if (!error) { setComposer(''); await loadData(); setNotice('Posted to the tribe ✨'); return }
    }
    setPosts([{ id: crypto.randomUUID(), name: 'You', username: '@you', time: 'now', text: composer.trim(), tag: 'New', likes: 0, comments: 0, gradient: 'mint' }, ...posts])
    setComposer(''); setNotice('Posted in demo mode — connect Supabase to persist it.')
  }

  async function openChat(person) {
    setActiveChat(person); setChatMessages([])
    if (!supabase || !session || person.id.length < 20) return
    const { data: conversationId } = await supabase.rpc('get_or_create_dm', { other_user: person.id })
    if (!conversationId) return
    const { data } = await supabase.from('messages').select('id,body,sender_id,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(100)
    if (data) setChatMessages(data)
  }

  async function sendMessage() {
    if (!message.trim() || !activeChat) return
    if (supabase && session && activeChat.id.length > 20) {
      const { data: conversationId } = await supabase.rpc('get_or_create_dm', { other_user: activeChat.id })
      if (conversationId) {
        const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: session.user.id, body: message.trim() })
        if (!error) { setChatMessages([...chatMessages, { id: crypto.randomUUID(), body: message.trim(), sender_id: session.user.id, created_at: new Date().toISOString() }]); setMessage(''); return }
      }
    }
    setChatMessages([...chatMessages, { id: crypto.randomUUID(), body: message.trim(), sender_id: 'local' }]); setMessage('')
  }

  if (!session) return <EntryScreen {...{ authMode, setAuthMode, email, setEmail, password, setPassword, name, setName, username, setUsername, invite, setInvite, accepted, setAccepted, authError, notice, authenticate }} />

  const currentName = session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Student'
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
        <div className="hero"><div><p className="eyebrow">THURSDAY • CAMPUS PULSE</p><h1>Good morning, {currentName.split(' ')[0]}.</h1><p>See what's happening around your campus today.</p></div><button className="primary" onClick={()=>document.getElementById('composer')?.focus()}>＋ Create post</button></div>
        <div className="stories"><div className="story add"><span>＋</span><small>Your story</small></div>{['Campus','Clubs','Projects','Sports','Study'].map((x,i)=><div className="story" key={x}><div className={`storyRing r${i}`}>{['🎓','🎨','💻','🏆','📚'][i]}</div><small>{x}</small></div>)}</div>
        <div className="layout"><div className="feed"><div className="composer"><div className="avatar">{currentName[0]?.toUpperCase()}</div><textarea id="composer" value={composer} onChange={e=>setComposer(e.target.value)} placeholder="What's happening in your tribe?" /><button onClick={createPost}>Post</button></div>{posts.map(p=><Post key={p.id} post={p} liked={liked.includes(p.id)} saved={saved.includes(p.id)} onLike={()=>setLiked(liked.includes(p.id)?liked.filter(x=>x!==p.id):[...liked,p.id])} onSave={()=>setSaved(saved.includes(p.id)?saved.filter(x=>x!==p.id):[...saved,p.id])} />)}</div><RightRail people={people} onChat={openChat} /></div>
      </>}
      {tab==='explore' && <Explore posts={posts} />}
      {tab==='members' && <Members people={people} onChat={openChat} />}
      {tab==='messages' && <Messages people={people} activeChat={activeChat} setActiveChat={openChat} chatMessages={chatMessages} message={message} setMessage={setMessage} sendMessage={sendMessage} />}
      {tab==='saved' && <Empty title="Saved posts" text="Posts you save will appear here." />}
      {tab==='profile' && <Profile name={currentName} email={session.user.email} posts={posts.filter(p=>p.name===currentName)} />}
      {tab==='ai' && <AI />}
      {notice && <div className="toast" onClick={()=>setNotice('')}>{notice} ×</div>}
    </section>
  </main>
}

function EntryScreen(p) { return <main className="entry"><div className="entryGlow"/><section className="entryCard"><div className="entryLogo">V</div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>KL Vibe Tribe</h1><p className="tagline">Your campus. Your people. Your vibe.</p><div className="tabs"><button className={p.authMode==='signin'?'selected':''} onClick={()=>p.setAuthMode('signin')}>Sign in</button><button className={p.authMode==='signup'?'selected':''} onClick={()=>p.setAuthMode('signup')}>Join tribe</button></div><form onSubmit={p.authenticate}>{p.authMode==='signup'&&<><label>Name<input value={p.name} onChange={e=>p.setName(e.target.value)} placeholder="Your name" /></label><label>Username<input value={p.username} onChange={e=>p.setUsername(e.target.value)} placeholder="yourhandle" /></label><label>Campus invite code<input value={p.invite} onChange={e=>p.setInvite(e.target.value)} placeholder="Invite code" /></label></>}<label>Email<input type="email" value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="you@kluniversity.in" required /></label><label>Password<input type="password" value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="••••••••" required /></label><label className="check"><input type="checkbox" checked={p.accepted} onChange={e=>p.setAccepted(e.target.checked)} /> I agree to the community guidelines and understand that private chats are private.</label>{p.authError&&<div className="error">{p.authError}</div>}{p.notice&&<div className="success">{p.notice}</div>}<button className="primary full">{p.authMode==='signup'?'Enter the tribe':'Continue to tribe'} →</button></form><div className="entryFoot"><span>🔒 Private by design</span><span>•</span><span>Built for KL students</span></div></section></main> }

function Post({post,liked,saved,onLike,onSave}) { return <article className="post"><div className="postHead"><div className="avatar">{post.name[0]}</div><div><b>{post.name}</b><span>{post.username} · {post.time}</span></div><button className="more">•••</button></div>{post.media?<img className="postMedia" src={post.media} alt="Post"/>:<div className={`postVisual ${post.gradient}`}><span>{post.tag}</span></div>}<p className="postText">{post.text}</p><div className="postMeta"><span>{post.likes + (liked?1:0)} likes</span><span>{post.comments} comments</span></div><div className="postActions"><button className={liked?'on':''} onClick={onLike}>♡ Like</button><button>◌ Comment</button><button>⌁ Share</button><button className={saved?'on':''} onClick={onSave}>♧ Save</button></div></article> }
function RightRail({people,onChat}) { return <aside className="rail"><div className="railBlock"><div className="railTitle"><b>People you may know</b><span>View all</span></div>{people.slice(0,4).map(p=><div className="person" key={p.id}><div className="avatar">{p.name[0]}</div><div><b>{p.name}</b><span>{p.branch}</span></div><button onClick={()=>onChat(p)}>Message</button></div>)}</div><div className="railBlock guide"><span className="miniIcon">✦</span><b>Keep the vibe good.</b><p>Be respectful. Share responsibly. Report anything that breaks community rules.</p><button>Community guidelines →</button></div></aside> }
function Explore({posts}) { return <div className="page"><p className="eyebrow">DISCOVER</p><h2>Explore the tribe</h2><p className="muted">Trending public posts from around campus.</p><div className="grid">{posts.map(p=><div className="tile" key={p.id}><div className={`postVisual ${p.gradient}`}><span>{p.tag}</span></div><b>{p.text}</b><small>{p.likes} likes · {p.comments} comments</small></div>)}</div></div> }
function Members({people,onChat}) { return <div className="page"><p className="eyebrow">CAMPUS DIRECTORY</p><h2>Members</h2><div className="memberGrid">{people.map(p=><div className="member" key={p.id}><div className="avatar big">{p.name[0]}</div><b>{p.name}</b><span>{p.username}</span><small>{p.branch} · {p.online?'Online':'Recently active'}</small><button onClick={()=>onChat(p)}>Message</button></div>)}</div></div> }
function Messages({people,activeChat,setActiveChat,chatMessages,message,setMessage,sendMessage}) { return <div className="messages"><div className="chatList"><p className="eyebrow">PRIVATE</p><h2>Messages</h2>{people.map(p=><button className={activeChat?.id===p.id?'chatItem active':'chatItem'} key={p.id} onClick={()=>setActiveChat(p)}><div className="avatar">{p.name[0]}</div><div><b>{p.name}</b><span>Start a private chat</span></div></button>)}</div><div className="chatPane">{activeChat?<><div className="chatHead"><div className="avatar">{activeChat.name[0]}</div><div><b>{activeChat.name}</b><span>{activeChat.branch}</span></div></div><div className="bubbleArea">{chatMessages.length===0&&<div className="emptyChat">Messages here are private. Vibe AI never reads this chat.</div>}{chatMessages.map(m=><div className={m.sender_id==='local'?'bubble mine':'bubble mine'} key={m.id}>{m.body}</div>)}</div><div className="chatInput"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Write a private message..."/><button onClick={sendMessage}>↑</button></div></>:<div className="emptyChat">Select a student to start a private conversation.</div>}</div></div> }
function Profile({name,email,posts}) { return <div className="page profilePage"><div className="profileHero"><div className="avatar huge">{name[0]}</div><div><p className="eyebrow">MY PROFILE</p><h2>{name}</h2><span>{email}</span><p>KL student · Building, learning and vibing.</p></div><button className="secondary">Edit profile</button></div><h3>My posts</h3>{posts.length?<div className="feed narrow">{posts.map(p=><Post key={p.id} post={p} liked={false} saved={false} onLike={()=>{}} onSave={()=>{}}/>)}</div>:<Empty title="No posts yet" text="Share something with the tribe."/>}</div> }
function AI() { const [q,setQ]=useState(''); const [answer,setAnswer]=useState(''); const ask=()=>{setAnswer(q?`Vibe AI can help with public campus information, community rules, events, study resources and post ideas. I won't access or summarize private 1-to-1 messages.`:'Try asking about community rules, a public post, an event, or a project idea.')}; return <div className="aiPage"><div className="aiOrb">✦</div><p className="eyebrow">VIBE AI</p><h2>Your campus copilot.</h2><p className="muted">Helpful with public community information. Private chats stay private.</p><div className="aiBox"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask Vibe AI anything about the tribe..."/><button onClick={ask}>Ask</button></div>{answer&&<div className="answer"><b>Vibe AI</b><p>{answer}</p></div>}<div className="suggestions"><button onClick={()=>setQ('What are the community guidelines?')}>Community guidelines</button><button onClick={()=>setQ('Give me ideas for a campus post')}>Post ideas</button><button onClick={()=>setQ('Help me plan a project')}>Project ideas</button></div></div> }
function Empty({title,text}) { return <div className="empty"><div>✦</div><h3>{title}</h3><p>{text}</p></div> }
