<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { locale, setLocale, t } from '$lib/i18n/locale.js';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<header
	class="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm"
>
	<div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
		<a href={resolve('/')} class="font-semibold text-slate-900 hover:text-sky-800">{t($locale, 'nav.brand')}</a>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<div
				class="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium"
				role="group"
				aria-label={t($locale, 'nav.langAria')}
			>
				<button
					type="button"
					class="rounded-md px-2 py-1 transition {$locale === 'ko'
						? 'bg-white text-slate-900 shadow-sm'
						: 'text-slate-600 hover:text-slate-900'}"
					onclick={() => setLocale('ko')}
				>
					{t($locale, 'nav.langKo')}
				</button>
				<button
					type="button"
					class="rounded-md px-2 py-1 transition {$locale === 'en'
						? 'bg-white text-slate-900 shadow-sm'
						: 'text-slate-600 hover:text-slate-900'}"
					onclick={() => setLocale('en')}
				>
					{t($locale, 'nav.langEn')}
				</button>
			</div>
			<nav class="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-slate-600">
				<a href={resolve('/voice-chat')} class="hover:text-slate-900">{t($locale, 'nav.voiceChat')}</a>
				<a href={resolve('/db-test')} class="hover:text-slate-900">{t($locale, 'nav.dbTest')}</a>
				{#if data.user}
					<a href={resolve('/settings')} class="hover:text-slate-900">{t($locale, 'nav.settings')}</a>
					<span class="text-slate-400 truncate max-w-[10rem]" title={data.user.email ?? ''}
						>{data.user.email}</span
					>
				{:else}
					<a href={resolve('/login')} class="font-medium text-sky-700 hover:text-sky-900"
						>{t($locale, 'nav.login')}</a
					>
				{/if}
			</nav>
		</div>
	</div>
</header>
{@render children()}
