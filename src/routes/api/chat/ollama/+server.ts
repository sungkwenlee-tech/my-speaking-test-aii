import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DEFAULT_BASE = 'http://127.0.0.1:11434';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
	}

	if (!body || typeof body !== 'object') {
		return json({ error: '잘못된 요청입니다.' }, { status: 400 });
	}

	const b = body as Record<string, unknown>;
	const messages = b.messages;
	const model = typeof b.model === 'string' && b.model.trim() ? b.model.trim() : 'llama3.2';

	if (!Array.isArray(messages) || messages.length === 0) {
		return json({ error: 'messages 배열이 필요합니다.' }, { status: 400 });
	}

	const base = (typeof env.OLLAMA_BASE_URL === 'string' && env.OLLAMA_BASE_URL.trim()
		? env.OLLAMA_BASE_URL.trim()
		: DEFAULT_BASE
	).replace(/\/$/, '');

	try {
		const resp = await fetch(`${base}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages,
				stream: false
			})
		});

		const data = (await resp.json().catch(() => ({}))) as {
			message?: { content?: string };
			error?: string;
		};

		if (!resp.ok) {
			const detail = typeof data?.error === 'string' ? data.error : resp.statusText;
			return json(
				{
					error:
						`Ollama 요청 실패 (${resp.status}): ${detail}\n` +
						`Ollama를 설치하고 실행했는지, 모델을 받았는지 확인하세요. (예: ollama pull ${model})`
				},
				{ status: 502 }
			);
		}

		const text = typeof data?.message?.content === 'string' ? data.message.content : '';
		if (!text) {
			return json({ error: 'Ollama 응답에 본문이 없습니다.' }, { status: 502 });
		}

		return json({ text });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const isConn =
			msg.includes('fetch failed') ||
			msg.includes('ECONNREFUSED') ||
			msg.includes('ENOTFOUND') ||
			msg.includes('connect');
		return json(
			{
				error: isConn
					? `Ollama에 연결할 수 없습니다. PC에서 Ollama를 실행한 뒤 다시 시도하세요. (${base})\n원인: ${msg}`
					: `Ollama 연결 오류: ${msg}`
			},
			{ status: 503 }
		);
	}
};
