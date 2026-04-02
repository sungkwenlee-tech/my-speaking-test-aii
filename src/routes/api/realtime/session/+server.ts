import { formatOpenAiErrorForUser } from '$lib/openai/formatOpenAiError.js';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = env.OPENAI_API_KEY;
	if (!apiKey) {
		return json({ error: 'OPENAI_API_KEY is not configured on the server.' }, { status: 500 });
	}

	let body: unknown = null;
	try {
		body = await request.json();
	} catch {
		// ignore
	}

	const instructions =
		body && typeof body === 'object' && 'instructions' in body && typeof (body as any).instructions === 'string'
			? (body as any).instructions
			: undefined;

	// GA Realtime: ephemeral client secret must come from /v1/realtime/client_secrets
	// (sessions from /v1/realtime/sessions are beta-style and mismatch GA WebSocket).
	const resp = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			expires_after: { anchor: 'created_at', seconds: 600 },
			session: {
				type: 'realtime',
				model: 'gpt-realtime',
				instructions,
				// GA: audio modality includes spoken reply + transcript (cannot mix text+audio).
				output_modalities: ['audio'],
				audio: {
					input: {
						format: { type: 'audio/pcm', rate: 24000 },
						turn_detection: {
							type: 'server_vad',
							threshold: 0.5,
							silence_duration_ms: 500,
							prefix_padding_ms: 300,
							create_response: true,
							interrupt_response: true
						}
					},
					output: {
						format: { type: 'audio/pcm', rate: 24000 },
						voice: 'marin'
					}
				}
			}
		})
	});

	const data: any = await resp.json().catch(() => ({}));
	if (!resp.ok) {
		const errObj = data?.error;
		const code =
			errObj && typeof errObj === 'object' && typeof errObj.code === 'string' ? errObj.code : undefined;
		const apiMessage =
			errObj && typeof errObj === 'object' && typeof errObj.message === 'string'
				? errObj.message
				: typeof data?.error === 'string'
					? data.error
					: '';
		const { message, helpUrl } = formatOpenAiErrorForUser(code, apiMessage);
		return json(
			{
				error: message,
				help_url: helpUrl,
				error_code: code ?? null
			},
			{ status: resp.status }
		);
	}

	const secretValue = data?.value ?? data?.session?.client_secret?.value;
	const secretExpiresAt = data?.expires_at ?? data?.session?.client_secret?.expires_at;

	return json({
		session_id: data?.session?.id,
		client_secret: secretValue
			? { value: secretValue, expires_at: secretExpiresAt }
			: null
	});
};

