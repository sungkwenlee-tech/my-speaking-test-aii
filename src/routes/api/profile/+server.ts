import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const {
		data: { user },
		error: userErr
	} = await event.locals.supabase.auth.getUser();
	if (userErr || !user) {
		return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	}

	const { data, error } = await event.locals.supabase
		.from('profiles')
		.select('id, display_name, default_engine, tutor_notes, created_at, updated_at')
		.eq('id', user.id)
		.maybeSingle();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ profile: data });
};

export const PUT: RequestHandler = async (event) => {
	const {
		data: { user },
		error: userErr
	} = await event.locals.supabase.auth.getUser();
	if (userErr || !user) {
		return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	}

	let body: {
		display_name?: string | null;
		default_engine?: string;
		tutor_notes?: string | null;
	} = {};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
	}

	const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if ('display_name' in body) patch.display_name = body.display_name;
	if (typeof body.default_engine === 'string' && ['free', 'openai'].includes(body.default_engine)) {
		patch.default_engine = body.default_engine;
	}
	if ('tutor_notes' in body) patch.tutor_notes = body.tutor_notes;

	const row = { id: user.id, ...patch };
	const { data, error } = await event.locals.supabase
		.from('profiles')
		.upsert(row, { onConflict: 'id' })
		.select('id, display_name, default_engine, tutor_notes')
		.single();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ profile: data });
};
