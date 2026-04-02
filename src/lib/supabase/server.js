import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { isSupabaseConfigured } from './client.js';

/**
 * 서버 라우트(+server.ts) 등에서 사용. 세션 쿠키 연동 없이 anon 키만 씁니다.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createSupabaseServerClient() {
	if (!isSupabaseConfigured()) {
		throw new Error(
			'Supabase 환경 변수가 없습니다. .env에 PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY를 설정하세요.'
		);
	}
	return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: {
			persistSession: false,
			autoRefreshToken: false
		}
	});
}
