import type { PageServerLoad } from './$types';

/** 오픈 리다이렉트 방지: 같은 사이트 내부 경로만 허용 */
function safeRedirectPath(raw: string | null) {
	if (!raw || typeof raw !== 'string') return '/';
	const p = raw.trim();
	if (!p.startsWith('/') || p.startsWith('//')) return '/';
	return p;
}

export const load: PageServerLoad = async ({ url }) => {
	return {
		redirectTo: safeRedirectPath(url.searchParams.get('redirect'))
	};
};
