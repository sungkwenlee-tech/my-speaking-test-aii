/** @type {const} */
export const OPENAI_BILLING_URL = 'https://platform.openai.com/account/billing';

/** @type {const} */
export const OPENAI_ERROR_DOCS_URL = 'https://platform.openai.com/docs/guides/error-codes/api-errors';

/**
 * Map OpenAI API / Realtime error codes and messages to Korean UI copy + optional help link.
 * @param {string | undefined} code
 * @param {string | undefined} apiMessage
 * @returns {{ message: string; helpUrl: string | null }}
 */
export function formatOpenAiErrorForUser(code, apiMessage) {
	const raw = (apiMessage || '').trim();
	const lower = raw.toLowerCase();

	// 서버가 이미 한글로 줄인 안내 문구(또는 유사 표현)도 결제/한도 안내로 묶음
	const quotaKo =
		(raw.includes('한도') && (raw.includes('부족') || raw.includes('초과'))) ||
		(raw.includes('결제') && (raw.includes('필요') || raw.includes('확인'))) ||
		raw.includes('청구');

	const quotaLike =
		code === 'insufficient_quota' ||
		lower.includes('exceeded your current quota') ||
		(lower.includes('quota') && (lower.includes('billing') || lower.includes('plan'))) ||
		quotaKo;

	if (quotaLike) {
		return {
			message:
				'OpenAI 사용 한도가 부족하거나 결제 설정이 필요합니다. 잔액·월 사용 한도·결제 수단을 확인해 주세요. Realtime(음성) API는 일반 채팅보다 비용이 커서 한도에 더 빨리 도달할 수 있습니다.',
			helpUrl: OPENAI_BILLING_URL
		};
	}

	if (code === 'invalid_api_key' || lower.includes('invalid api key') || lower.includes('incorrect api key')) {
		return {
			message:
				'API 키가 올바르지 않거나 만료되었을 수 있습니다. 서버의 OPENAI_API_KEY(.env 또는 호스팅 환경 변수)를 확인해 주세요.',
			helpUrl: OPENAI_ERROR_DOCS_URL
		};
	}

	if (code === 'rate_limit_exceeded' || lower.includes('rate limit')) {
		return {
			message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
			helpUrl: OPENAI_ERROR_DOCS_URL
		};
	}

	if (code === 'billing_not_active' || lower.includes('billing_not_active')) {
		return {
			message: 'OpenAI 결제(청구)가 활성화되어 있지 않습니다. 결제 수단 등록 및 청구 설정을 확인해 주세요.',
			helpUrl: OPENAI_BILLING_URL
		};
	}

	if (raw) {
		return {
			message: raw,
			helpUrl: OPENAI_ERROR_DOCS_URL
		};
	}

	return {
		message: 'OpenAI 요청 중 오류가 발생했습니다.',
		helpUrl: OPENAI_ERROR_DOCS_URL
	};
}
