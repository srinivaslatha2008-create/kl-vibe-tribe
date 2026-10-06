create or replace function public.claim_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.invite_codes%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into code_row from public.invite_codes where code = upper(trim(invite_code)) and active = true for update;
  if not found or code_row.uses >= code_row.max_uses then return false; end if;
  insert into public.community_members(user_id) values (auth.uid()) on conflict do nothing;
  update public.invite_codes set uses = uses + 1 where code = code_row.code;
  return true;
end;
$$;

revoke execute on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

create or replace function public.get_or_create_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
begin
  if current_user_id is null or other_user is null or current_user_id = other_user then
    return null;
  end if;

  select c.id into conversation_id
  from public.conversations c
  where exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = current_user_id)
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = other_user)
    and 2 = (select count(*) from public.conversation_members cm where cm.conversation_id = c.id);

  if conversation_id is null then
    insert into public.conversations default values returning id into conversation_id;
    insert into public.conversation_members(conversation_id, user_id) values (conversation_id, current_user_id), (conversation_id, other_user);
  end if;
  return conversation_id;
end;
$$;

revoke execute on function public.get_or_create_dm(uuid) from public, anon;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
