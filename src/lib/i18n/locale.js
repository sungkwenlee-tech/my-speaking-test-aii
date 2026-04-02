import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { dict } from './dictionaries.js';

/**
 * @param {'ko' | 'en'} loc
 * @param {string} key dot.path e.g. nav.brand
 */
export function t(loc, key) {
	const parts = key.split('.');
	/** @type {unknown} */
	let node = dict[loc];
	for (const p of parts) {
		if (node && typeof node === 'object' && p in /** @type {object} */ (node)) {
			node = /** @type {Record<string, unknown>} */ (node)[p];
		} else {
			return key;
		}
	}
	return typeof node === 'string' ? node : key;
}

/**
 * Friendlier text for common Supabase Auth errors (often English from the API).
 * @param {'ko' | 'en'} loc
 * @param {string} raw
 */
export function authErrorMessage(loc, raw) {
	const m = (raw || '').toLowerCase();
	if (m.includes('email not confirmed')) return t(loc, 'login.authEmailNotConfirmed');
	if (
		m.includes('error sending confirmation email') ||
		m.includes('sending confirmation email') ||
		m.includes('unable to send confirmation')
	)
		return t(loc, 'login.authConfirmationEmailFailed');
	if (m.includes('invalid login credentials')) return t(loc, 'login.authInvalidCredentials');
	return raw;
}

export const locale = writable(/** @type {'ko' | 'en'} */ ('ko'));

if (browser) {
	const s = localStorage.getItem('sk-speaking-locale');
	if (s === 'en' || s === 'ko') {
		locale.set(s);
	}
}

/** @param {'ko' | 'en'} l */
export function setLocale(l) {
	locale.set(l);
	if (browser) {
		localStorage.setItem('sk-speaking-locale', l);
	}
}
