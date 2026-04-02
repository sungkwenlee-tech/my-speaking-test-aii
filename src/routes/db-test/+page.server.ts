import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { user } = await safeGetSession();
	if (!user) {
		redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	}
	return {};
};
