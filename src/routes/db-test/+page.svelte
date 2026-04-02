<script>
	import { resolve } from '$app/paths';
	import { locale, t } from '$lib/i18n/locale.js';

	let loading = $state(false);
	/** @type {{ ok?: boolean; message?: string; mode?: string; step?: string; error?: string; hint?: string; warning?: string } | null} */
	let result = $state(null);
	let httpStatus = $state(/** @type {number | null} */ (null));
	let fetchError = $state(/** @type {string | null} */ (null));

	async function runTest() {
		loading = true;
		result = null;
		httpStatus = null;
		fetchError = null;
		try {
			const res = await fetch('/api/db/test');
			httpStatus = res.status;
			const data = await res.json();
			result = data;
		} catch (e) {
			fetchError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{t($locale, 'dbTest.title')}</title>
</svelte:head>

<div
	class="min-h-dvh bg-gradient-to-b from-slate-100 via-white to-indigo-50 text-slate-800 flex flex-col items-center px-4 py-10 sm:py-14"
>
	<div class="w-full max-w-lg space-y-6">
		<header class="text-center space-y-2">
			<h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
				{t($locale, 'dbTest.title')}
			</h1>
			<p class="text-sm text-slate-600">
				{t($locale, 'dbTest.subtitle')}
			</p>
		</header>

		<div
			class="rounded-3xl bg-white/90 shadow-xl shadow-slate-200/60 border border-slate-200/80 px-6 py-8 space-y-6"
		>
			<button
				type="button"
				class="w-full rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 px-4 shadow-sm transition"
				disabled={loading}
				onclick={() => runTest()}
			>
				{loading ? t($locale, 'dbTest.running') : t($locale, 'dbTest.run')}
			</button>

			{#if httpStatus !== null}
				<p class="text-sm text-slate-600">
					{t($locale, 'dbTest.httpStatus')}: <span class="font-mono font-semibold text-slate-900">{httpStatus}</span>
					{#if result?.mode}
						<span class="text-slate-400"> · </span>
						{t($locale, 'dbTest.mode')}: <span class="font-mono text-slate-800">{result.mode}</span>
					{/if}
				</p>
			{/if}

			{#if fetchError}
				<div
					class="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900"
					role="alert"
				>
					<p class="font-medium">{t($locale, 'dbTest.requestFailed')}</p>
					<p class="mt-1 font-mono text-xs break-all">{fetchError}</p>
					<p class="mt-2 text-rose-800">
						{t($locale, 'dbTest.checkDev')}
					</p>
				</div>
			{/if}

			{#if result}
				{#if result.ok}
					<div
						class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900"
						role="status"
					>
						<p class="font-semibold flex items-center gap-2">
							<span class="text-lg" aria-hidden="true">✓</span>
							{t($locale, 'dbTest.success')}
						</p>
						{#if result.message}
							<p class="mt-2 leading-relaxed">{result.message}</p>
						{/if}
					</div>
				{:else}
					<div
						class="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900 space-y-2"
						role="alert"
					>
						<p class="font-semibold">{t($locale, 'dbTest.fail')} {#if result.step}<span class="font-mono text-xs">({result.step})</span>{/if}</p>
						{#if result.error}
							<p class="font-mono text-xs break-all whitespace-pre-wrap">{result.error}</p>
						{/if}
						{#if result.hint}
							<p class="text-rose-800 text-xs leading-relaxed">{result.hint}</p>
						{/if}
						{#if result.warning}
							<p class="text-amber-900 text-xs leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-2">{result.warning}</p>
						{/if}
					</div>
				{/if}

				<details class="text-xs text-slate-500">
					<summary class="cursor-pointer hover:text-slate-700 select-none">{t($locale, 'dbTest.rawJson')}</summary>
					<pre
						class="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 overflow-x-auto text-slate-700 font-mono">{JSON.stringify(
							result,
							null,
							2
						)}</pre>
				</details>
			{/if}
		</div>

		<p class="text-center text-sm">
			<a
				href={resolve('/')}
				class="text-sky-700 hover:text-sky-900 underline underline-offset-2"
			>{t($locale, 'dbTest.home')}</a>
			<span class="text-slate-300 mx-2">·</span>
			<a
				href={resolve('/voice-chat')}
				class="text-sky-700 hover:text-sky-900 underline underline-offset-2"
			>{t($locale, 'dbTest.voiceChat')}</a>
		</p>
	</div>
</div>
