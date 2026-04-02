<script>
	import { createBrowserClient } from '@supabase/ssr';
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { locale, t } from '$lib/i18n/locale.js';

	const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	let displayName = $state('');
	let defaultEngine = $state(/** @type {'free' | 'openai'} */ ('free'));
	let tutorNotes = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state(/** @type {string | null} */ (null));
	let saved = $state(false);

	onMount(async () => {
		try {
			const r = await fetch('/api/profile', { credentials: 'include' });
			const j = await r.json();
			if (!r.ok) throw new Error(j?.error || '불러오기 실패');
			const p = j?.profile;
			if (p) {
				displayName = p.display_name ?? '';
				if (p.default_engine === 'openai' || p.default_engine === 'free') {
					defaultEngine = p.default_engine;
				}
				tutorNotes = p.tutor_notes ?? '';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	});

	async function save() {
		error = null;
		saved = false;
		saving = true;
		try {
			const r = await fetch('/api/profile', {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					display_name: displayName.trim() || null,
					default_engine: defaultEngine,
					tutor_notes: tutorNotes.trim() || null
				})
			});
			const j = await r.json();
			if (!r.ok) throw new Error(j?.error || '저장 실패');
			saved = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	async function signOut() {
		await supabase.auth.signOut();
		goto(resolve('/'));
	}
</script>

<svelte:head>
	<title>{t($locale, 'settings.title')}</title>
</svelte:head>

<div
	class="min-h-dvh bg-gradient-to-b from-slate-100 via-white to-indigo-50 text-slate-800 flex flex-col items-center px-4 py-10"
>
	<div class="w-full max-w-md space-y-6">
		<header class="flex items-center justify-between gap-4">
			<h1 class="text-2xl font-bold text-slate-900">{t($locale, 'settings.title')}</h1>
			<button
				type="button"
				class="text-sm text-slate-600 hover:text-slate-900"
				onclick={() => signOut()}
			>
				{t($locale, 'settings.signOut')}
			</button>
		</header>

		{#if loading}
			<p class="text-sm text-slate-600">{t($locale, 'settings.loading')}</p>
		{:else}
			<form
				class="rounded-2xl bg-white border border-slate-200 shadow-lg p-6 space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					save();
				}}
			>
				<p class="text-xs text-slate-500">{t($locale, 'settings.loggedInAs')}: {page.data.user.email}</p>

				<label class="block space-y-1">
					<span class="text-sm font-medium text-slate-700">{t($locale, 'settings.displayName')}</span>
					<input class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" bind:value={displayName} />
				</label>

				<label class="block space-y-1">
					<span class="text-sm font-medium text-slate-700">{t($locale, 'settings.defaultEngine')}</span>
					<select class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" bind:value={defaultEngine}>
						<option value="free">{t($locale, 'settings.engineFree')}</option>
						<option value="openai">{t($locale, 'settings.engineOpenai')}</option>
					</select>
				</label>

				<label class="block space-y-1">
					<span class="text-sm font-medium text-slate-700">{t($locale, 'settings.tutorNotes')}</span>
					<textarea
						class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[88px]"
						placeholder={t($locale, 'settings.tutorPlaceholder')}
						bind:value={tutorNotes}
					></textarea>
				</label>

				<button
					type="submit"
					disabled={saving}
					class="w-full rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold py-3"
				>
					{saving ? t($locale, 'settings.saving') : t($locale, 'settings.save')}
				</button>

				{#if saved}
					<p class="text-sm text-emerald-700">{t($locale, 'settings.saved')}</p>
				{/if}
				{#if error}
					<p class="text-sm text-rose-700" role="alert">{error}</p>
				{/if}
			</form>
		{/if}

		<p class="text-center text-sm">
			<a href={resolve('/voice-chat')} class="text-sky-700 underline underline-offset-2"
				>{t($locale, 'settings.linkVoice')}</a
			>
			<span class="text-slate-300 mx-2">·</span>
			<a href={resolve('/')} class="text-sky-700 underline underline-offset-2"
				>{t($locale, 'settings.linkHome')}</a
			>
		</p>
	</div>
</div>
