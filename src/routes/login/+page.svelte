<script>
	import { createBrowserClient } from '@supabase/ssr';
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { get } from 'svelte/store';
	import { authErrorMessage, locale, t } from '$lib/i18n/locale.js';

	let { data } = $props();

	let email = $state('');
	let password = $state('');
	let passwordConfirm = $state('');
	let mode = $state(/** @type {'login' | 'signup'} */ ('login'));
	let loading = $state(false);
	let message = $state(/** @type {string | null} */ (null));
	let error = $state(/** @type {string | null} */ (null));

	const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	async function submit() {
		error = null;
		message = null;
		const loc = get(locale);
		if (mode === 'signup' && password !== passwordConfirm) {
			error = t(loc, 'login.passwordMismatch');
			return;
		}
		loading = true;
		try {
			if (mode === 'signup') {
				const { error: e } = await supabase.auth.signUp({
					email: email.trim(),
					password,
					options: {
						emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}${resolve('/auth/callback')}`
					}
				});
				if (e) throw e;
				message = t(loc, 'login.signupEmailSent');
			} else {
				const { error: e } = await supabase.auth.signInWithPassword({
					email: email.trim(),
					password
				});
				if (e) throw e;
				await invalidateAll();
				goto(resolve(data.redirectTo));
			}
		} catch (e) {
			const raw = e instanceof Error ? e.message : String(e);
			error = authErrorMessage(loc, raw);
		} finally {
			loading = false;
		}
	}

	function switchMode(/** @type {'login' | 'signup'} */ m) {
		mode = m;
		passwordConfirm = '';
		error = null;
		message = null;
	}
</script>

<svelte:head>
	<title>{t($locale, 'login.title')}</title>
</svelte:head>

<div
	class="min-h-dvh bg-gradient-to-b from-slate-100 via-white to-indigo-50 text-slate-800 flex flex-col items-center px-4 py-12"
>
	<div class="w-full max-w-sm space-y-6">
		<header class="text-center space-y-1">
			<h1 class="text-2xl font-bold text-slate-900">{t($locale, 'login.title')}</h1>
			<p class="text-sm text-slate-600">{t($locale, 'login.subtitle')}</p>
		</header>

		<div class="rounded-2xl bg-white border border-slate-200 shadow-lg p-6 space-y-4">
			<div class="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
				<button
					type="button"
					class="flex-1 rounded-md py-2 transition {mode === 'login' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}"
					onclick={() => switchMode('login')}
				>
					{t($locale, 'login.tabLogin')}
				</button>
				<button
					type="button"
					class="flex-1 rounded-md py-2 transition {mode === 'signup' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}"
					onclick={() => switchMode('signup')}
				>
					{t($locale, 'login.tabSignup')}
				</button>
			</div>

			<form
				class="space-y-3"
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label class="block space-y-1">
					<span class="text-xs font-medium text-slate-600">{t($locale, 'login.email')}</span>
					<input
						type="email"
						autocomplete="email"
						required
						class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
						bind:value={email}
					/>
				</label>
				<label class="block space-y-1">
					<span class="text-xs font-medium text-slate-600">{t($locale, 'login.password')}</span>
					<input
						type="password"
						autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
						required
						minlength="6"
						class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
						bind:value={password}
					/>
				</label>
				{#if mode === 'signup'}
					<label class="block space-y-1">
						<span class="text-xs font-medium text-slate-600">{t($locale, 'login.passwordConfirm')}</span>
						<input
							type="password"
							autocomplete="new-password"
							required
							minlength="6"
							class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
							bind:value={passwordConfirm}
						/>
					</label>
				{/if}
				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold py-3"
				>
					{loading
						? t($locale, 'login.processing')
						: mode === 'signup'
							? t($locale, 'login.submitSignup')
							: t($locale, 'login.submitLogin')}
				</button>
			</form>

			{#if error}
				<p class="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
					{error}
				</p>
			{/if}
			{#if message}
				<p class="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
					{message}
				</p>
			{/if}
		</div>

		<p class="text-center text-sm">
			<a href={resolve('/')} class="text-sky-700 underline underline-offset-2">{t($locale, 'login.home')}</a>
		</p>
	</div>
</div>
