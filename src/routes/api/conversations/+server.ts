import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const {
		data: { user },
		error: userErr
	} = await event.locals.supabase.auth.getUser();
	if (userErr || !user) {
		return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	}

	let body: { engine?: string; title?: string | null } = {};
	try {
		body = await event.request.json();
	} catch {
		// empty body ok
	}

	const engine = typeof body.engine === 'string' ? body.engine : null;
	const title = typeof body.title === 'string' ? body.title : null;

	const { data, error } = await event.locals.supabase
		.from('conversations')
		.insert({
			user_id: user.id,
			engine,
			title
		})
		.select('id')
		.single();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ id: data.id });
};
