create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade, username text unique not null, display_name text not null default 'KL Student', avatar_url text, bio text, branch text, created_at timestamptz not null default now());
create table if not exists public.posts(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, caption text, media_url text, created_at timestamptz not null default now());
create table if not exists public.likes(post_id uuid references public.posts(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(post_id,user_id));
create table if not exists public.comments(id uuid primary key default gen_random_uuid(),post_id uuid references public.posts(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,body text not null,created_at timestamptz not null default now());
create table if not exists public.conversations(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now());
create table if not exists public.conversation_members(conversation_id uuid references public.conversations(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,primary key(conversation_id,user_id));
create table if not exists public.messages(id uuid primary key default gen_random_uuid(),conversation_id uuid references public.conversations(id) on delete cascade,sender_id uuid references public.profiles(id) on delete cascade,body text not null,created_at timestamptz not null default now());
create table if not exists public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles(id) on delete cascade,actor_id uuid references public.profiles(id) on delete cascade,type text not null,post_id uuid references public.posts(id) on delete cascade,is_read boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.community_members(user_id uuid primary key references auth.users(id) on delete cascade,joined_at timestamptz not null default now());
create table if not exists public.invite_codes(code text primary key,max_uses int not null default 3000,uses int not null default 0,active boolean not null default true,created_at timestamptz not null default now());
insert into public.invite_codes(code) values('KLVIBE26') on conflict do nothing;

alter table public.profiles enable row level security; alter table public.posts enable row level security; alter table public.likes enable row level security; alter table public.comments enable row level security; alter table public.conversations enable row level security; alter table public.conversation_members enable row level security; alter table public.messages enable row level security; alter table public.notifications enable row level security; alter table public.community_members enable row level security;

drop policy if exists profiles_read on public.profiles; create policy profiles_read on public.profiles for select to authenticated using(true);
drop policy if exists profiles_write on public.profiles; create policy profiles_write on public.profiles for insert to authenticated with check(id=auth.uid());
drop policy if exists profiles_update on public.profiles; create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists posts_read on public.posts; create policy posts_read on public.posts for select to authenticated using(true);
drop policy if exists posts_write on public.posts; create policy posts_write on public.posts for insert to authenticated with check(user_id=auth.uid());
drop policy if exists posts_update on public.posts; create policy posts_update on public.posts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists posts_delete on public.posts; create policy posts_delete on public.posts for delete to authenticated using(user_id=auth.uid());
drop policy if exists likes_read on public.likes; create policy likes_read on public.likes for select to authenticated using(true);
drop policy if exists likes_write on public.likes; create policy likes_write on public.likes for insert to authenticated with check(user_id=auth.uid());
drop policy if exists likes_delete on public.likes; create policy likes_delete on public.likes for delete to authenticated using(user_id=auth.uid());
drop policy if exists comments_read on public.comments; create policy comments_read on public.comments for select to authenticated using(true);
drop policy if exists comments_write on public.comments; create policy comments_write on public.comments for insert to authenticated with check(user_id=auth.uid());
drop policy if exists comments_delete on public.comments; create policy comments_delete on public.comments for delete to authenticated using(user_id=auth.uid());
drop policy if exists cm_read on public.conversation_members; create policy cm_read on public.conversation_members for select to authenticated using(user_id=auth.uid());
drop policy if exists conv_read on public.conversations; create policy conv_read on public.conversations for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=id and cm.user_id=auth.uid()));
drop policy if exists msg_read on public.messages; create policy msg_read on public.messages for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
drop policy if exists msg_write on public.messages; create policy msg_write on public.messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
drop policy if exists notif_read on public.notifications; create policy notif_read on public.notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists notif_update on public.notifications; create policy notif_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists community_read on public.community_members; create policy community_read on public.community_members for select to authenticated using(true);
drop policy if exists community_insert on public.community_members; create policy community_insert on public.community_members for insert to authenticated with check(user_id=auth.uid());

create or replace function public.kl_new_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,username,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'username','student_'||substr(new.id::text,1,8)),coalesce(new.raw_user_meta_data->>'display_name','KL Student')) on conflict(id) do nothing; return new; end; $$;
drop trigger if exists kl_profile_trigger on auth.users; create trigger kl_profile_trigger after insert on auth.users for each row execute function public.kl_new_profile();

create or replace function public.claim_invite(invite_code text) returns boolean language plpgsql security definer set search_path=public as $$ declare claimed boolean; begin if auth.uid() is null then return false; end if; if exists(select 1 from public.community_members where user_id=auth.uid()) then return true; end if; update public.invite_codes set uses=uses+1 where code=upper(trim(invite_code)) and active and uses<max_uses returning true into claimed; if not coalesce(claimed,false) then return false; end if; insert into public.community_members(user_id) values(auth.uid()) on conflict do nothing; return true; end; $$;
grant execute on function public.claim_invite(text) to authenticated;

create or replace function public.get_or_create_dm(other_user uuid) returns uuid language plpgsql security definer set search_path=public as $$ declare c_id uuid; begin if auth.uid() is null or other_user is null or other_user=auth.uid() then raise exception 'Invalid recipient'; end if; select cm1.conversation_id into c_id from public.conversation_members cm1 join public.conversation_members cm2 on cm2.conversation_id=cm1.conversation_id where cm1.user_id=auth.uid() and cm2.user_id=other_user limit 1; if c_id is not null then return c_id; end if; insert into public.conversations default values returning id into c_id; insert into public.conversation_members(conversation_id,user_id) values(c_id,auth.uid()),(c_id,other_user); return c_id; end; $$;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

create index if not exists posts_created_idx on public.posts(created_at desc); create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at); create index if not exists comments_post_idx on public.comments(post_id,created_at);
