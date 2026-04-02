import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ROLES = new Set(['system', 'user', 'assistant']);

export const POST: RequestHandler = async (event) => {
	const {
		data: { user },
		error: userErr
	} = await event.locals.supabase.auth.getUser();
	if (userErr || !user) {
		return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	}

	const conversationId = event.params.id;
	let body: { role?: string; content?: string } = {};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
	}

	const role = typeof body.role === 'string' ? body.role : '';
	const content = typeof body.content === 'string' ? body.content : '';
	if (!ROLES.has(role)) {
		return json({ error: 'role은 system | user | assistant 여야 합니다.' }, { status: 400 });
	}

	const { error } = await event.locals.supabase.from('messages').insert({
		conversation_id: conversationId,
		role,
		content
	});

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ ok: true });
};
