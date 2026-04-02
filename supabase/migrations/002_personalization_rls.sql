-- 개인화: profiles + conversations.user_id + 본인만 RLS
-- 선행 조건: supabase/schema.sql(초기 테이블) 이미 실행됨
-- Supabase → SQL Editor 에서 이 파일 전체 실행

-- ---------------------------------------------------------------------------
-- 1) 기존 “전면 허용” 정책 제거 (anon/인증 모두 무제한이던 정책)
-- ---------------------------------------------------------------------------
drop policy if exists "conversations_allow_all_anon" on public.conversations;
drop policy if exists "messages_allow_all_anon" on public.messages;
drop policy if exists "conversations_allow_all_authenticated" on public.conversations;
drop policy if exists "messages_allow_all_authenticated" on public.messages;

-- ---------------------------------------------------------------------------
-- 2) 대화에 소유자 연결 (로그인 사용자 = auth.users)
-- ---------------------------------------------------------------------------
alter table public.conversations
	add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists conversations_user_id_idx on public.conversations (user_id);

comment on column public.conversations.user_id is 'Supabase Auth 사용자. 앱에서는 항상 auth.uid()와 동일한 값으로 insert.';

-- ---------------------------------------------------------------------------
-- 3) 프로필(설정): 기본 엔진, 표시 이름, 튜터용 메모 등
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	display_name text,
	default_engine text not null default 'free' check (default_engine in ('free', 'openai')),
	tutor_notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 가입 시 자동으로 profiles 한 줄 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.profiles (id, display_name, default_engine)
	values (
		new.id,
		nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
		'free'
	)
	on conflict (id) do nothing;
	return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

grant all on table public.profiles to authenticated;

create policy "profiles_select_own"
	on public.profiles
	for select
	to authenticated
	using (auth.uid() = id);

create policy "profiles_insert_own"
	on public.profiles
	for insert
	to authenticated
	with check (auth.uid() = id);

create policy "profiles_update_own"
	on public.profiles
	for update
	to authenticated
	using (auth.uid() = id)
	with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 4) conversations: 본인 소유 행만
-- ---------------------------------------------------------------------------
create policy "conversations_select_own"
	on public.conversations
	for select
	to authenticated
	using (user_id = auth.uid());

create policy "conversations_insert_own"
	on public.conversations
	for insert
	to authenticated
	with check (user_id = auth.uid());

create policy "conversations_update_own"
	on public.conversations
	for update
	to authenticated
	using (user_id = auth.uid())
	with check (user_id = auth.uid());

create policy "conversations_delete_own"
	on public.conversations
	for delete
	to authenticated
	using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) messages: 소속 conversation의 소유자만
-- ---------------------------------------------------------------------------
create policy "messages_select_own"
	on public.messages
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.conversations c
			where c.id = messages.conversation_id
				and c.user_id = auth.uid()
		)
	);

create policy "messages_insert_own"
	on public.messages
	for insert
	to authenticated
	with check (
		exists (
			select 1
			from public.conversations c
			where c.id = messages.conversation_id
				and c.user_id = auth.uid()
		)
	);

create policy "messages_update_own"
	on public.messages
	for update
	to authenticated
	using (
		exists (
			select 1
			from public.conversations c
			where c.id = messages.conversation_id
				and c.user_id = auth.uid()
		)
	)
	with check (
		exists (
			select 1
			from public.conversations c
			where c.id = messages.conversation_id
				and c.user_id = auth.uid()
		)
	);

create policy "messages_delete_own"
	on public.messages
	for delete
	to authenticated
	using (
		exists (
			select 1
			from public.conversations c
			where c.id = messages.conversation_id
				and c.user_id = auth.uid()
		)
	);

-- anon 키만으로는 위 정책에 걸리지 않아 읽기/쓰기 불가 (의도된 동작).
-- 서버 자동 테스트는 SUPABASE_SERVICE_ROLE_KEY 로 service_role 클라이언트 사용.
