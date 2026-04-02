import { isSupabaseConfigured } from '$lib/supabase/client.js';
import { createSupabaseServerClient } from '$lib/supabase/server.js';
import { createSupabaseServiceClient } from '$lib/supabase/service.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET: conversations / messages에 임시 행을 넣었다가 삭제해 연결을 검증합니다.
 * 개인화(RLS) 적용 후에는 service_role 키가 있으면 그걸로 검사합니다(우회).
 * 없으면 anon 클라이언트로 시도 → RLS 환경에서는 실패할 수 있음.
 */
export const GET: RequestHandler = async () => {
	if (!isSupabaseConfigured()) {
		return json(
			{
				ok: false,
				step: 'config',
				error: 'PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY 가 .env에 없거나 placeholder 입니다.'
			},
			{ status: 503 }
		);
	}

	const service = createSupabaseServiceClient();
	let supabase;
	let mode = 'anon';
	try {
		if (service) {
			supabase = service;
			mode = 'service_role';
		} else {
			supabase = createSupabaseServerClient();
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return json({ ok: false, step: 'client', error: msg }, { status: 500 });
	}

	const { data: conv, error: convErr } = await supabase
		.from('conversations')
		.insert({ title: 'api-selftest', engine: 'test' })
		.select('id')
		.single();

	if (convErr) {
		return json(
			{
				ok: false,
				step: 'insert_conversation',
				error: convErr.message,
				mode,
				hint:
					mode === 'anon'
						? 'RLS 적용 후에는 anon으로 insert가 막힐 수 있습니다. .env에 SUPABASE_SERVICE_ROLE_KEY(서버 전용)를 넣거나 supabase/migrations/002_personalization_rls.sql 실행 여부를 확인하세요.'
						: 'supabase/schema.sql 실행 여부와 테이블 이름을 확인하세요.'
			},
			{ status: 502 }
		);
	}

	const convId = conv?.id as string;

	const { error: msgErr } = await supabase.from('messages').insert({
		conversation_id: convId,
		role: 'system',
		content: 'api selftest — will be deleted'
	});

	if (msgErr) {
		await supabase.from('conversations').delete().eq('id', convId);
		return json(
			{ ok: false, step: 'insert_message', error: msgErr.message },
			{ status: 502 }
		);
	}

	const { error: delErr } = await supabase.from('conversations').delete().eq('id', convId);

	if (delErr) {
		return json(
			{
				ok: false,
				step: 'delete_conversation',
				error: delErr.message,
				warning: '임시 대화 행이 DB에 남았을 수 있습니다. Table Editor에서 title = api-selftest 를 삭제하세요.'
			},
			{ status: 502 }
		);
	}

	return json({
		ok: true,
		mode,
		message:
			mode === 'service_role'
				? 'Supabase 통신 정상(service_role): insert → messages insert → delete(cascade).'
				: 'Supabase 통신 정상(anon): insert → messages insert → delete(cascade). 개인화 마이그레이션 후에는 service_role 키를 권장합니다.'
	});
};
