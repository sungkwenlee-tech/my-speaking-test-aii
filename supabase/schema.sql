-- Supabase → SQL Editor 에서 전체 실행
-- 영어 회화 앱: 대화 세션(conversations) + 메시지(messages)

-- 확장 (UUID 생성 — 대부분의 Supabase 프로젝트에서 이미 켜져 있음)
create extension if not exists "pgcrypto";

-- 대화 세션 (한 번 마이크 연결 ~ 연결 해제 등)
create table public.conversations (
	id uuid primary key default gen_random_uuid(),
	created_at timestamptz not null default now(),
	title text,
	-- 'free' | 'openai' 등 클라이언트에서 넣는 값 (선택)
	engine text
);

-- 개별 메시지
create table public.messages (
	id uuid primary key default gen_random_uuid(),
	conversation_id uuid not null references public.conversations (id) on delete cascade,
	role text not null check (role in ('system', 'user', 'assistant')),
	content text not null default '',
	created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);

-- Row Level Security
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ---------------------------------------------------------------------------
-- 주의: 아래 정책은 "누구나 anon 키로 전부 읽기/쓰기" 가능합니다.
-- 개인 프로토타입·로컬 테스트용입니다. 공개 배포 전에는 Supabase Auth +
-- user_id 컬럼 + 본인 데이터만 허용하는 정책으로 바꾸세요.
-- ---------------------------------------------------------------------------

create policy "conversations_allow_all_anon"
	on public.conversations
	for all
	to anon
	using (true)
	with check (true);

create policy "messages_allow_all_anon"
	on public.messages
	for all
	to anon
	using (true)
	with check (true);

create policy "conversations_allow_all_authenticated"
	on public.conversations
	for all
	to authenticated
	using (true)
	with check (true);

create policy "messages_allow_all_authenticated"
	on public.messages
	for all
	to authenticated
	using (true)
	with check (true);

-- API(anon / 로그인 사용자)가 테이블에 접근할 수 있게 권한 부여
grant usage on schema public to anon, authenticated;
grant all on table public.conversations to anon, authenticated;
grant all on table public.messages to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- 개인화·로그인·본인만 RLS: supabase/migrations/002_personalization_rls.sql 실행
