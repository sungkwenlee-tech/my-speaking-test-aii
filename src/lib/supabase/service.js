import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

/**
 * service_role — RLS 우회. 서버 전용, 브라우저/클라이언트 번들에 넣지 마세요.
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function createSupabaseServiceClient() {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key || typeof key !== 'string' || !key.trim()) return null;
	return createClient(PUBLIC_SUPABASE_URL, key.trim(), {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
