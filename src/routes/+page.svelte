<script>
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';

	let recording = $state(false);
	let audioBlob = $state(/** @type {Blob | null} */ (null));
	let audioUrl = $state('');
	let error = $state(/** @type {string | null} */ (null));
	let elapsedSec = $state(0);

	/** @type {MediaRecorder | null} */
	let mediaRecorder = null;
	let chunks = /** @type {Blob[]} */ ([]);
	/** @type {MediaStream | null} */
	let stream = null;
	let tickInterval = /** @type {ReturnType<typeof setInterval> | null} */ (null);
	let startedAt = 0;
	let unmounted = false;

	function pickMimeType() {
		const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
		for (const t of candidates) {
			if (MediaRecorder.isTypeSupported(t)) return t;
		}
		return '';
	}

	async function startRecording() {
		error = null;
		clearRecording();
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true }
			});
			chunks = [];
			const mimeType = pickMimeType();
			const options = mimeType ? { mimeType } : {};
			mediaRecorder = new MediaRecorder(stream, options);
			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunks.push(e.data);
			};
			mediaRecorder.onstop = () => {
				if (unmounted) {
					stopStream();
					mediaRecorder = null;
					return;
				}
				const type = mediaRecorder?.mimeType || 'audio/webm';
				audioBlob = new Blob(chunks, { type });
				if (audioUrl) URL.revokeObjectURL(audioUrl);
				audioUrl = URL.createObjectURL(audioBlob);
				stopStream();
				mediaRecorder = null;
			};
			mediaRecorder.start(200);
			recording = true;
			startedAt = Date.now();
			elapsedSec = 0;
			tickInterval = setInterval(() => {
				elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
			}, 250);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			error =
				msg.includes('Permission') || msg.includes('NotAllowed')
					? '마이크 사용이 거부되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.'
					: `녹음을 시작할 수 없습니다: ${msg}`;
			stopStream();
		}
	}

	function stopStream() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (tickInterval) {
			clearInterval(tickInterval);
			tickInterval = null;
		}
	}

	function stopRecording() {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			recording = false;
			mediaRecorder.stop();
		} else {
			recording = false;
			stopStream();
		}
	}

	/** @param {boolean} [revoke] */
	function clearRecording(revoke = true) {
		if (revoke && audioUrl) URL.revokeObjectURL(audioUrl);
		audioUrl = '';
		audioBlob = null;
		error = null;
	}

	function formatTime(sec) {
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	onDestroy(() => {
		unmounted = true;
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			stopRecording();
		} else {
			stopStream();
		}
		if (audioUrl) URL.revokeObjectURL(audioUrl);
	});
</script>

<svelte:head>
	<title>음성 녹음</title>
</svelte:head>

<div
	class="min-h-dvh bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6"
>
	<div class="w-full max-w-md space-y-8">
		<header class="text-center space-y-2">
			<h1 class="text-2xl font-semibold tracking-tight text-neutral-100">음성 녹음</h1>
			<p class="text-sm text-zinc-400">마이크로 녹음한 뒤 재생해 내용을 확인하세요.</p>
			<p class="text-xs text-zinc-600">
				실시간 음성 채팅이 필요하면
				<a
					class="underline underline-offset-2 hover:text-zinc-200"
					href={resolve('/voice-chat')}
				>
					여기로 이동
				</a>
			</p>
		</header>

		<div
			class="rounded-2xl border border-zinc-500/35 bg-zinc-900/90 backdrop-blur-sm p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]"
		>
			<div class="flex flex-col items-center gap-6">
				<div class="relative flex h-28 w-28 items-center justify-center">
					{#if recording}
						<span
							class="absolute inset-0 rounded-full bg-red-600/25 animate-ping"
							aria-hidden="true"
						></span>
						<span
							class="absolute inset-2 rounded-full border-2 border-red-500/70"
							aria-hidden="true"
						></span>
					{/if}
					<button
						type="button"
						class="relative z-10 flex h-20 w-20 items-center justify-center rounded-full text-2xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.15),0_4px_12px_rgba(0,0,0,0.4)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 {recording
							? 'bg-red-600 hover:bg-red-500 ring-2 ring-red-400/50'
							: 'bg-zinc-600 hover:bg-zinc-500 ring-2 ring-zinc-400/40'}"
						onclick={() => (recording ? stopRecording() : startRecording())}
						aria-pressed={recording}
						aria-label={recording ? '녹음 중지' : '녹음 시작'}
					>
						{#if recording}
							<span class="h-4 w-4 rounded-sm bg-white" aria-hidden="true"></span>
						{:else}
							<span class="ml-0.5 h-0 w-0 border-y-[10px] border-y-transparent border-l-[16px] border-l-zinc-200" aria-hidden="true"></span>
						{/if}
					</button>
				</div>

				<div
					class="w-full rounded-lg border border-zinc-700/80 bg-[#0d0d0d] px-4 py-3 text-center shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]"
				>
					<p class="text-sm font-medium tabular-nums min-h-[1.25rem]">
						{#if recording}
							<span class="text-red-500">● REC</span>
							<span class="text-zinc-500"> · </span>
							<span class="font-mono text-amber-400/95 tabular-nums tracking-wide">{formatTime(elapsedSec)}</span>
						{:else if audioBlob}
							<span class="text-zinc-500">완료</span>
							<span class="text-zinc-600"> · </span>
							<span class="font-mono text-amber-500/90 tabular-nums"
								>{(audioBlob.size / 1024).toFixed(1)} KB</span
							>
						{:else}
							<span class="text-zinc-600">대기 중</span>
						{/if}
					</p>
				</div>

				{#if error}
					<p class="w-full rounded-lg bg-red-950/50 border border-red-800/60 px-3 py-2 text-sm text-red-200" role="alert">
						{error}
					</p>
				{/if}

				{#if audioUrl && !recording}
					<div class="w-full space-y-3">
						<p class="text-xs uppercase tracking-wide text-zinc-500 text-center">미리듣기</p>
						<audio class="w-full rounded-lg" controls src={audioUrl} preload="metadata">
							브라우저가 오디오 재생을 지원하지 않습니다.
						</audio>
						<button
							type="button"
							class="w-full rounded-xl border border-zinc-500/50 bg-zinc-800/80 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition"
							onclick={() => clearRecording()}
						>
							이 녹음 삭제하고 다시 녹음
						</button>
					</div>
				{/if}
			</div>
		</div>

		<p class="text-center text-xs text-zinc-600">
			HTTPS 또는 localhost에서만 마이크 접근이 가능합니다.
		</p>
	</div>
</div>
