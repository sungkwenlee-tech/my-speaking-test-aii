import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

/** @returns {boolean} */
export function isSupabaseConfigured() {
	return (
		Boolean(PUBLIC_SUPABASE_URL) &&
		Boolean(PUBLIC_SUPABASE_ANON_KEY) &&
		!PUBLIC_SUPABASE_ANON_KEY.startsWith('REPLACE')
	);
}

/**
 * Anon 클라이언트 (브라우저). Row Level Security가 적용됩니다.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createSupabaseBrowserClient() {
	if (!isSupabaseConfigured()) {
		throw new Error(
			'Supabase 환경 변수가 없습니다. .env에 PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY를 설정하세요.'
		);
	}
	return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}
