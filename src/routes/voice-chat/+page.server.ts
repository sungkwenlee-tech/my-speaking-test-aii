import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, url }) => {
	const { user } = await safeGetSession();
	if (!user) {
		redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	}
	const { data: profile } = await supabase
		.from('profiles')
		.select('default_engine')
		.eq('id', user.id)
		.maybeSingle();

	return { profile };
};
