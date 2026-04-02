/** @returns {typeof SpeechRecognition | null} */
export function getSpeechRecognitionCtor() {
	if (typeof window === 'undefined') return null;
	return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * @param {string} text
 * @param {{ onStart?: () => void; onEnd?: () => void; lang?: string }} [opts]
 */
export function speakText(text, opts = {}) {
	if (typeof window === 'undefined' || !text?.trim()) return;
	window.speechSynthesis.cancel();
	const u = new SpeechSynthesisUtterance(text.trim());
	u.lang = opts.lang ?? 'en-US';
	u.rate = 0.95;
	u.onstart = () => opts.onStart?.();
	u.onend = () => opts.onEnd?.();
	u.onerror = () => opts.onEnd?.();
	window.speechSynthesis.speak(u);
}

export function cancelSpeech() {
	if (typeof window !== 'undefined') window.speechSynthesis.cancel();
}
