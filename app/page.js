'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const POST_SELECT = 'id,user_id,caption,media_url,created_at,profiles(id,username,display_name,branch,avatar_url,bio)'

export default function Home() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('home')
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState([])
  const [liked, setLiked] = useState(new Set())
  const [saved, setSaved] = useState(new Set())
  const [comments, setComments] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [composer, setComposer] = useState('')
  const [activeChat, setActiveChat] = useState(null)
  const [message, setMessage] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [search, setSearch] = useState('')
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBio, setEditBio] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) loadData() }, [session])

  useEffect(() => {
    if (!session) return
    const channel = supabase.channel(`messages-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (activeChat && payload.new.sender_id === activeChat.id) setChatMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session, activeChat])

  async function loadData() {
    const { data: me } = await supabase.from('profiles').select('id,username,display_name,avatar_url,bio,branch,created_at').eq('id', session.user.id).maybeSingle()
    if (me) { setProfile(me); setEditBio(me.bio || '') }
    const { data: postRows } = await supabase.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).limit(100)
    setPosts((postRows || []).map(mapPost))
    const { data: members } = await supabase.from('community_members').select('user_id,joined_at,profiles(id,username,display_name,avatar_url,bio,branch,created_at)').order('joined_at', { ascending: false }).limit(3000)
    setPeople((members || []).map(row => { const p = row.profiles; return { id: p?.id || row.user_id, name: p?.display_name || p?.username || 'Student', username: '@' + (p?.username || 'student'), branch: p?.branch || 'CSE', bio: p?.bio || 'KL student', avatar: p?.avatar_url || '', joinedAt: row.joined_at } }))
    const { data: myLikes } = await supabase.from('likes').select('post_id').eq('user_id', session.user.id)
    setLiked(new Set((myLikes || []).map(x => x.post_id)))
    const { data: mySaved } = await supabase.from('saved_posts').select('post_id').eq('user_id', session.user.id)
    setSaved(new Set((mySaved || []).map(x => x.post_id)))
    await loadNotifications()
  }

  function mapPost(p) { return { id: p.id, userId: p.user_id, name: p.profiles?.display_name || p.profiles?.username || 'Student', username: '@' + (p.profiles?.username || 'student'), branch: p.profiles?.branch || 'CSE', time: relativeTime(p.created_at), text: p.caption || '', tag: 'Campus', gradient: 'ocean', media: p.media_url, avatar: p.profiles?.avatar_url || '', likes: 0 } }
  function relativeTime(date) { const mins = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000)); if (mins < 60) return `${mins}m`; const hours = Math.round(mins / 60); if (hours < 24) return `${hours}h`; return `${Math.round(hours / 24)}d` }
  function normalizeUsername(value) { return value.trim().toLowerCase().replace(/^@/, '') }

  async function authenticate(e) {
    e.preventDefault(); setAuthError(''); setNotice('')
    const cleanName = name.trim(), cleanUsername = normalizeUsername(username)
    if (cleanName.length < 2 || cleanName.length > 80) return setAuthError('Name must be 2–80 characters.')
    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return setAuthError('Username must be 3–32 characters using letters, numbers, dot, dash or underscore.')
    if (password.length < 6) return setAuthError('Password must be at least 6 characters.')
    const { data, error } = await supabase.functions.invoke('name-password-auth', { body: { name: cleanName, username: cleanUsername, password } })
    if (error || !data?.access_token || !data?.refresh_token) return setAuthError(data?.error || 'Could not create your profile. Try another username.')
    const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    if (sessionError) return setAuthError(sessionError.message)
    setName(''); setUsername(''); setPassword(''); setTab('home'); setNotice('Profile created. Welcome to KL Vibe Tribe!')
  }

  async function createPost() {
    const body = composer.trim(); if (!body || !session) return
    if (body.length > 2000) return setNotice('Posts are limited to 2,000 characters.')
    const { error } = await supabase.from('posts').insert({ user_id: session.user.id, caption: body })
    if (error) return setNotice(error.message)
    setComposer(''); await loadData(); setNotice('Posted to your tribe ✨')
  }

  async function toggleLike(postId) {
    if (liked.has(postId)) {
      const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', session.user.id)
      if (error) return setNotice(error.message)
      setLiked(prev => { const n = new Set(prev); n.delete(postId); return n })
    } else {
      const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: session.user.id })
      if (error) return setNotice(error.message)
      setLiked(prev => new Set([...prev, postId]))
    }
  }

  async function toggleSave(postId) {
    if (saved.has(postId)) {
      const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', session.user.id)
      if (error) return setNotice(error.message)
      setSaved(prev => { const n = new Set(prev); n.delete(postId); return n })
    } else {
      const { error } = await supabase.from('saved_posts').insert({ post_id: postId, user_id: session.user.id })
      if (error) return setNotice(error.message)
      setSaved(prev => new Set([...prev, postId]))
    }
  }

  async function loadComments(postId) {
    const { data, error } = await supabase.from('comments').select('id,body,user_id,created_at,profiles(display_name,username)').eq('post_id', postId).order('created_at', { ascending: true }).limit(50)
    if (error) return setNotice(error.message)
    setComments(prev => ({ ...prev, [postId]: data || [] }))
  }

  async function addComment(postId) {
    const body = (commentDrafts[postId] || '').trim(); if (!body) return
    const { error } = await supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, body })
    if (error) return setNotice(error.message)
    setCommentDrafts(prev => ({ ...prev, [postId]: '' })); await loadComments(postId)
  }

  async function openChat(person) {
    setActiveChat(person); setChatMessages([]); if (!person || person.id === session.user.id) return
    const { data: conversationId, error } = await supabase.rpc('get_or_create_dm', { other_user: person.id })
    if (error || !conversationId) return setNotice(error?.message || 'Could not open this conversation.')
    const { data, error: messageError } = await supabase.from('messages').select('id,body,sender_id,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(100)
    if (messageError) return setNotice(messageError.message)
    setChatMessages(data || []); setTab('messages')
  }

  async function sendMessage() {
    const body = message.trim(); if (!body || !activeChat || !session) return
    if (body.length > 2000) return setNotice('Messages are limited to 2,000 characters.')
    const { data: conversationId, error: rpcError } = await supabase.rpc('get_or_create_dm', { other_user: activeChat.id })
    if (rpcError || !conversationId) return setNotice(rpcError?.message || 'Could not send message.')
    const { data, error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: session.user.id, body }).select('id,body,sender_id,created_at').single()
    if (error) return setNotice(error.message)
    setChatMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]); setMessage('')
  }

  async function loadNotifications() {
    const { data } = await supabase.from('notifications').select('id,type,post_id,is_read,created_at,profiles:actor_id(display_name,username)').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(30)
    setNotifications(data || [])
  }

  async function markNotificationsRead() {
    setShowNotifications(v => !v)
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', session.user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function saveProfile() {
    const bio = editBio.trim().slice(0, 160)
    const { error } = await supabase.from('profiles').update({ bio }).eq('id', session.user.id)
    if (error) return setNotice(error.message)
    setProfile(prev => ({ ...prev, bio })); setEditing(false); setNotice('Profile updated.')
  }

  async function reportUser(person) {
    const reason = window.prompt('Why are you reporting this profile?'); if (!reason?.trim()) return
    const { error } = await supabase.from('reports').insert({ reporter_id: session.user.id, reported_user_id: person.id, reason: reason.trim().slice(0, 500), status: 'open' })
    setNotice(error ? error.message : 'Report submitted to moderators.')
  }

  async function blockUser(person) {
    if (!window.confirm(`Block ${person.name}?`)) return
    const { error } = await supabase.from('blocks').insert({ blocker_id: session.user.id, blocked_id: person.id })
    if (error) return setNotice(error.message)
    setNotice(`${person.name} is blocked.`); setPeople(prev => prev.filter(p => p.id !== person.id)); setSelectedProfile(null); setTab('members')
  }

  function showProfile(person) { if (person) { setSelectedProfile(person); setTab('profile') } }
  function signOut() { supabase?.auth.signOut(); setSelectedProfile(null); setTab('home') }

  const currentName = profile?.display_name || session?.user?.user_metadata?.display_name || 'Student'
  const currentUsername = profile?.username || session?.user?.user_metadata?.username || ''
  const viewedProfile = selectedProfile || { id: session?.user?.id, name: currentName, username: '@' + currentUsername, branch: profile?.branch || 'CSE', bio: profile?.bio || 'KL student', avatar: profile?.avatar_url || '' }
  const filteredPeople = useMemo(() => people.filter(p => `${p.name} ${p.username} ${p.branch}`.toLowerCase().includes(search.toLowerCase())), [people, search])
  const filteredPosts = useMemo(() => posts.filter(p => `${p.name} ${p.username} ${p.text}`.toLowerCase().includes(search.toLowerCase())), [posts, search])
  const viewedPosts = posts.filter(p => p.userId === viewedProfile.id)
  const unread = notifications.filter(n => !n.is_read).length

  if (!session) return <EntryScreen name={name} setName={setName} username={username} setUsername={setUsername} password={password} setPassword={setPassword} authError={authError} notice={notice} authenticate={authenticate} />

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><div className="brandMark">V</div><div><strong>KL Vibe Tribe</strong><span>Your campus, your vibe.</span></div></div><nav>{[['home','⌂','Home'],['explore','⌕','Explore'],['members','◎','Members'],['messages','◌','Messages'],['saved','♡','Saved'],['profile','◉','Profile']].map(([id,icon,label]) => <button key={id} className={tab===id?'nav active':'nav'} onClick={()=>{setTab(id);if(id==='profile')setSelectedProfile(null)}}><i>{icon}</i>{label}</button>)}</nav><div className="sideCard"><div className="spark">✦</div><strong>Vibe AI</strong><p>Ask about public campus information. Private messages never enter Vibe AI.</p><button onClick={()=>setTab('ai')}>Open assistant</button></div><button className="logout" onClick={signOut}>↪ Sign out</button></aside>
    <section className="content"><header className="topbar"><div className="mobileBrand"><div className="brandMark">V</div><b>KL Vibe Tribe</b></div><div className="search">⌕ <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search the tribe" /></div><div className="topActions"><button onClick={markNotificationsRead} aria-label="Notifications">♡{unread>0&&<sup>{unread}</sup>}</button><button onClick={()=>setTab('ai')}>✦</button><div className="avatar">{currentName[0]?.toUpperCase()}</div></div></header>
      {showNotifications && <div className="notificationPanel">{notifications.length?notifications.map(n=><div key={n.id}><b>{n.profiles?.display_name || n.profiles?.username || 'Someone'}</b> {n.type==='like'?'liked your post':n.type==='comment'?'commented on your post':'followed you'} <small>{relativeTime(n.created_at)}</small></div>):<p>No notifications yet.</p>}</div>}
      {tab==='home' && <HomeFeed posts={filteredPosts} people={people.filter(p=>p.id!==session.user.id)} currentName={currentName} currentUsername={currentUsername} composer={composer} setComposer={setComposer} createPost={createPost} liked={liked} saved={saved} toggleLike={toggleLike} toggleSave={toggleSave} comments={comments} commentDrafts={commentDrafts} setCommentDrafts={setCommentDrafts} loadComments={loadComments} addComment={addComment} openChat={openChat} showProfile={showProfile}/>} 
      {tab==='explore' && <Explore posts={filteredPosts} liked={liked} saved={saved} toggleLike={toggleLike} toggleSave={toggleSave}/>} 
      {tab==='members' && <Members people={filteredPeople} onChat={openChat} onProfile={showProfile}/>} 
      {tab==='messages' && <Messages people={people} activeChat={activeChat} setActiveChat={openChat} chatMessages={chatMessages} message={message} setMessage={setMessage} sendMessage={sendMessage} currentUserId={session.user.id}/>} 
      {tab==='saved' && <div className="page"><p className="eyebrow">YOUR COLLECTION</p><h2>Saved posts</h2><div className="feed narrow">{posts.filter(p=>saved.has(p.id)).map(p=><Post key={p.id} post={p} liked={liked.has(p.id)} saved={true} onLike={()=>toggleLike(p.id)} onSave={()=>toggleSave(p.id)} comments={comments[p.id]||[]} commentDraft={commentDrafts[p.id]||''} setCommentDraft={v=>setCommentDrafts(prev=>({...prev,[p.id]:v}))} loadComments={()=>loadComments(p.id)} addComment={()=>addComment(p.id)}/>)}</div>{!posts.some(p=>saved.has(p.id))&&<Empty title="Nothing saved" text="Save posts you want to come back to."/>}</div>}
      {tab==='profile' && <Profile person={viewedProfile} posts={viewedPosts} own={viewedProfile.id===session.user.id} editing={editing} setEditing={setEditing} editBio={editBio} setEditBio={setEditBio} saveProfile={saveProfile} onReport={()=>reportUser(viewedProfile)} onBlock={()=>blockUser(viewedProfile)}/>} 
      {tab==='ai' && <AI session={session}/>} {notice && <div className="toast" onClick={()=>setNotice('')}>{notice} ×</div>}
    </section>
  </main>
}

function EntryScreen({name,setName,username,setUsername,password,setPassword,authError,notice,authenticate}) { return <main className="entry"><div className="entryGlow"/><section className="entryCard"><div className="entryLogo">V</div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>KL Vibe Tribe</h1><p className="tagline">Your campus. Your people. Your vibe.</p><form onSubmit={authenticate}><label>Your name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" autoComplete="name" required/></label><label>Create username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="yourhandle" autoCapitalize="none" autoComplete="username" required/></label><label>Create password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required/></label>{authError&&<div className="error">{authError}</div>}{notice&&<div className="success">{notice}</div>}<p className="joinNote">By joining, you agree to keep the campus community respectful and responsible.</p><button className="primary full">Create my profile →</button></form><div className="entryFoot"><span>🔒 Private by design</span><span>•</span><span>No email · No phone · No OTP</span></div></section></main> }

function HomeFeed({posts,people,currentName,currentUsername,composer,setComposer,createPost,liked,saved,toggleLike,toggleSave,comments,commentDrafts,setCommentDrafts,loadComments,addComment,openChat,showProfile}) { return <><div className="hero"><div><p className="eyebrow">PRIVATE CAMPUS COMMUNITY</p><h1>Good morning, {currentName}.</h1><p>@{currentUsername}</p></div><button className="primary" onClick={()=>document.getElementById('composer')?.focus()}>＋ Create post</button></div><div className="stories"><div className="story add"><span>＋</span><small>Your story</small></div>{['Campus','Clubs','Projects','Sports','Study'].map((x,i)=><div className="story" key={x}><div className={`storyRing r${i}`}>{['🎓','🎨','💻','🏆','📚'][i]}</div><small>{x}</small></div>)}</div><div className="layout"><div className="feed"><div className="composer"><div className="avatar">{currentName[0]?.toUpperCase()}</div><textarea id="composer" value={composer} onChange={e=>setComposer(e.target.value)} placeholder="What's happening in your tribe?"/><button onClick={createPost}>Post</button></div>{posts.length?posts.map(p=><Post key={p.id} post={p} liked={liked.has(p.id)} saved={saved.has(p.id)} onLike={()=>toggleLike(p.id)} onSave={()=>toggleSave(p.id)} comments={comments[p.id]||[]} commentDraft={commentDrafts[p.id]||''} setCommentDraft={v=>setCommentDrafts(prev=>({...prev,[p.id]:v}))} loadComments={()=>loadComments(p.id)} addComment={()=>addComment(p.id)}/>):<Empty title="No posts yet" text="Be the first student to share something with the tribe."/>}</div><RightRail people={people} onChat={openChat} onProfile={showProfile}/></div></> }

function Post({post,liked,saved,onLike,onSave,comments=[],commentDraft='',setCommentDraft=()=>{},loadComments=()=>{},addComment=()=>{}}) { return <article className="post"><div className="postHead"><div className="avatar">{post.avatar?<img src={post.avatar} alt=""/>:post.name[0]}</div><div><b>{post.name}</b><span>{post.username} · {post.time}</span></div><button className="more">•••</button></div>{post.media?<img className="postMedia" src={post.media} alt="Post"/>:<div className={`postVisual ${post.gradient}`}><span>{post.tag}</span></div>}<p className="postText">{post.text}</p><div className="postMeta"><span>{post.likes+(liked?1:0)} likes</span><span>{comments.length} comments</span></div><div className="postActions"><button className={liked?'on':''} onClick={onLike}>♡ Like</button><button onClick={loadComments}>◌ Comments</button><button onClick={()=>navigator.clipboard?.writeText(window.location.href)}>⌁ Share</button><button className={saved?'on':''} onClick={onSave}>♧ Save</button></div>{comments.length>0&&<div className="commentList">{comments.map(c=><div className="comment" key={c.id}><b>{c.profiles?.display_name||c.profiles?.username||'Student'}</b><span>{c.body}</span></div>)}</div>}<div className="commentBox"><input value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addComment()} placeholder="Write a comment..."/><button onClick={addComment}>↑</button></div></article> }

function RightRail({people,onChat,onProfile}) { return <aside className="rail"><div className="railBlock"><div className="railTitle"><b>Students inside</b><span>{people.length}</span></div>{people.slice(0,5).map(p=><div className="person" key={p.id}><div className="avatar">{p.avatar?<img src={p.avatar} alt=""/>:p.name[0]}</div><div><b>{p.name}</b><span>{p.username}</span></div><button onClick={()=>onChat(p)}>Message</button></div>)}{people.length===0&&<p className="muted">No other students have joined yet.</p>}<button className="textButton" onClick={()=>people[0]&&onProfile(people[0])}>See students →</button></div><div className="railBlock guide"><span className="miniIcon">✦</span><b>Keep the vibe good.</b><p>Be respectful. Share responsibly. Report anything that breaks community rules.</p></div></aside> }

function Explore({posts,liked,saved,toggleLike,toggleSave}) { return <div className="page"><p className="eyebrow">DISCOVER</p><h2>Explore the tribe</h2><p className="muted">Public posts from students inside the community.</p>{posts.length?<div className="grid">{posts.map(p=><div className="tile" key={p.id}>{p.media?<img className="postMedia" src={p.media} alt=""/>:<div className={`postVisual ${p.gradient}`}><span>{p.tag}</span></div>}<b>{p.name}</b><p>{p.text}</p><small>{p.username} · {p.time}</small><div className="postActions"><button onClick={()=>toggleLike(p.id)} className={liked.has(p.id)?'on':''}>♡ Like</button><button onClick={()=>toggleSave(p.id)} className={saved.has(p.id)?'on':''}>♧ Save</button></div></div>)}</div>:<Empty title="Nothing to explore yet" text="Real student posts will appear here after someone shares one."/>}</div> }

function Members({people,onChat,onProfile}) { return <div className="page"><p className="eyebrow">WHO'S INSIDE</p><h2>Students inside KL Vibe Tribe</h2><p className="muted">Only students who actually joined the community appear here.</p>{people.length?<div className="memberGrid">{people.map(p=><div className="member" key={p.id}><div className="avatar big">{p.avatar?<img src={p.avatar} alt=""/>:p.name[0]}</div><b>{p.name}</b><span>{p.username}</span><small>{p.branch}</small><p>{p.bio}</p><div className="memberActions"><button onClick={()=>onChat(p)}>Message</button><button onClick={()=>onProfile(p)}>Profile</button></div></div>)}</div>:<Empty title="No members yet" text="Students who create a profile will appear here."/>}</div> }

function Messages({people,activeChat,setActiveChat,chatMessages,message,setMessage,sendMessage,currentUserId}) { const others=people.filter(p=>p.id!==currentUserId); return <div className="messages"><div className="chatList"><p className="eyebrow">PRIVATE</p><h2>Messages</h2>{others.map(p=><button className={activeChat?.id===p.id?'chatItem active':'chatItem'} key={p.id} onClick={()=>setActiveChat(p)}><div className="avatar">{p.avatar?<img src={p.avatar} alt=""/>:p.name[0]}</div><div><b>{p.name}</b><span>{p.username}</span></div></button>)}{others.length===0&&<p className="muted">No other students to message yet.</p>}</div><div className="chatPane">{activeChat?<><div className="chatHead"><div className="avatar">{activeChat.avatar?<img src={activeChat.avatar} alt=""/>:activeChat.name[0]}</div><div><b>{activeChat.name}</b><span>{activeChat.username}</span></div></div><div className="bubbleArea">{chatMessages.length===0&&<div className="emptyChat">Messages here are private. Vibe AI never reads this chat.</div>}{chatMessages.map(m=><div className={m.sender_id===currentUserId?'bubble mine':'bubble'} key={m.id}>{m.body}</div>)}</div><div className="chatInput"><input maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Write a private message..."/><button onClick={sendMessage}>↑</button></div></>:<div className="emptyChat">Select a real student to start a private conversation.</div>}</div></div> }

function Profile({person,posts,own,editing,setEditing,editBio,setEditBio,saveProfile,onReport,onBlock}) { return <div className="page profilePage"><div className="profileHero"><div className="avatar huge">{person.avatar?<img src={person.avatar} alt=""/>:person.name?.[0]}</div><div><p className="eyebrow">{own?'MY PROFILE':'STUDENT PROFILE'}</p><h2>{person.name}</h2><span>{person.username}</span>{editing?<div className="profileEdit"><textarea value={editBio} onChange={e=>setEditBio(e.target.value)} maxLength={160}/><button className="primary" onClick={saveProfile}>Save</button></div>:<><p>{person.bio}</p><small>{person.branch} · KL Vibe Tribe</small></>}</div>{own?<button className="secondary" onClick={()=>setEditing(v=>!v)}>{editing?'Cancel':'Edit profile'}</button>:<div className="profileMenu"><button className="secondary" onClick={onReport}>Report</button><button className="secondary danger" onClick={onBlock}>Block</button></div>}</div><h3>{own?'My posts':`${person.name}'s posts`}</h3>{posts.length?<div className="feed narrow">{posts.map(p=><Post key={p.id} post={p} liked={false} saved={false} onLike={()=>{}} onSave={()=>{}}/>)}</div>:<Empty title="No posts yet" text={own?'Share something with the tribe.':'This student has not posted anything yet.'}/>}</div> }

function AI({session}) { const [q,setQ]=useState(''); const [answer,setAnswer]=useState(''); const [loading,setLoading]=useState(false); async function ask(){if(!q.trim())return;setLoading(true);setAnswer('');try{const {data:{session:current}}=await supabase.auth.getSession();const res=await fetch('/api/vibe-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${current?.access_token||session?.access_token||''}`},body:JSON.stringify({question:q.trim()})});const data=await res.json();setAnswer(data.answer||data.error||'I could not answer that right now.')}catch{setAnswer('Vibe AI is temporarily unavailable.')}finally{setLoading(false)}} return <div className="aiPage"><div className="aiOrb">✦</div><p className="eyebrow">VIBE AI</p><h2>Your campus copilot.</h2><p className="muted">Vibe AI can use public community information only. Private 1-to-1 messages are never sent to this assistant.</p><div className="aiBox"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask Vibe AI about the tribe..."/><button onClick={ask}>{loading?'…':'Ask'}</button></div>{answer&&<div className="answer"><b>Vibe AI</b><p>{answer}</p></div>}<div className="suggestions"><button onClick={()=>setQ('What is KL Vibe Tribe?')}>What is this community?</button><button onClick={()=>setQ('Summarize recent public posts')}>Summarize public posts</button><button onClick={()=>setQ('What are the community rules?')}>Community rules</button></div></div> }

function Empty({title,text}) { return <div className="empty"><div>✦</div><h3>{title}</h3><p>{text}</p></div> }
