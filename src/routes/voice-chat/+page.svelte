<script>
	import captureWorkletUrl from '$lib/audio/worklets/realtime-capture-processor.js?url';
	import playbackWorkletUrl from '$lib/audio/worklets/realtime-playback-processor.js?url';
	import {
		cancelSpeech,
		getSpeechRecognitionCtor,
		speakText
	} from '$lib/voice/browserSpeech.js';
	import { formatOpenAiErrorForUser } from '$lib/openai/formatOpenAiError.js';
	import { onDestroy } from 'svelte';

	/** @typedef {'free' | 'openai'} Engine */
	let engine = $state(/** @type {Engine} */ ('free'));
	let ollamaModel = $state('llama3.2');
	/** Ollama 응답/음성 재생 중에는 음성 인식을 잠시 멈춤 */
	let freeBusy = $state(false);

	let status = $state('idle'); // idle | connecting | listening | error
	let error = $state(/** @type {string | null} */ (null));
	let errorHelpUrl = $state(/** @type {string | null} */ (null));
	let clientSecretValue = $state('');

	/** @type {SpeechRecognition | null} */
	let recognition = null;

	// Chat UI: system welcome + assistant transcript (+ user later)
	let messages = $state(
		/** @type {{ role: 'system' | 'assistant' | 'user'; text: string; ts: number }[]} */ ([])
	);
	let streamingText = $state('');
	let isUserSpeaking = $state(false);
	let showDebug = $state(false);

	/** @type {WebSocket | null} */
	let ws = $state(null);

	// Audio (input + output)
	const INPUT_SAMPLE_RATE = 24000; // Realtime expects PCM16 at 24kHz
	/** @type {AudioContext | null} */
	let audioCtx = null;

	/** @type {MediaStream | null} */
	let micStream = null;
	/** @type {MediaStreamAudioSourceNode | null} */
	let micSource = null;
	/** @type {AudioWorkletNode | null} */
	let captureNode = null;

	/** @type {AudioWorkletNode | null} */
	let playbackNode = null;

	let workletsRegistered = false;

	let currentResponseId = null;

	/** WebSocket이 닫혀도 방금 Realtime error 이벤트가 있었다면 status를 idle로 덮어쓰지 않음 */
	let keepErrorUiOnWsClose = false;

	const SYSTEM_CONNECTED_OPENAI =
		'영어 회화 AI에 연결되었습니다! 자유롭게 대화해보세요.';
	const SYSTEM_CONNECTED_FREE =
		'무료 모드입니다. 영어로 말하면 로컬 Ollama가 답하고 브라우저가 읽어 줍니다. 스피커 대신 이어폰을 권장합니다.';

	const OLLAMA_TUTOR_SYSTEM =
		'You are a friendly English conversation tutor. Help the user practice spoken English: respond in clear, natural English, keep replies concise unless they ask for more, and gently correct major mistakes when helpful.';

	function formatTime(ts) {
		return new Date(ts).toLocaleTimeString('ko-KR', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}

	function clearHistory() {
		streamingText = '';
		if (status === 'listening') {
			const sys = engine === 'free' ? SYSTEM_CONNECTED_FREE : SYSTEM_CONNECTED_OPENAI;
			messages = [{ role: 'system', text: sys, ts: Date.now() }];
		} else {
			messages = [];
		}
	}

	function buildOllamaMessages() {
		/** @type {{ role: string; content: string }[]} */
		const out = [{ role: 'system', content: OLLAMA_TUTOR_SYSTEM }];
		for (const m of messages) {
			if (m.role === 'user' || m.role === 'assistant') {
				out.push({ role: m.role, content: m.text });
			}
		}
		return out;
	}

	function stopFreeRecognition() {
		if (!recognition) return;
		try {
			recognition.onresult = null;
			recognition.onerror = null;
			recognition.onend = null;
			recognition.abort();
		} catch {
			try {
				recognition.stop();
			} catch {
				// ignore
			}
		}
		recognition = null;
	}

	function startRecognitionSafe() {
		if (status !== 'listening' || engine !== 'free' || !recognition || freeBusy) return;
		try {
			recognition.start();
		} catch {
			// 이미 시작됨 등
		}
	}

	/**
	 * @param {string} text
	 */
	async function handleFreeUserText(text) {
		const trimmed = text.trim();
		if (!trimmed || status !== 'listening' || engine !== 'free') {
			freeBusy = false;
			startRecognitionSafe();
			return;
		}

		freeBusy = true;
		try {
			recognition?.stop();
		} catch {
			// ignore
		}

		messages = [...messages, { role: 'user', text: trimmed, ts: Date.now() }];

		try {
			const resp = await fetch('/api/chat/ollama', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: buildOllamaMessages(),
					model: ollamaModel
				})
			});
			const data = await resp.json();
			if (!resp.ok) {
				throw new Error(typeof data?.error === 'string' ? data.error : 'Ollama 요청 실패');
			}
			const reply = typeof data?.text === 'string' ? data.text : '';
			if (!reply) throw new Error('빈 응답입니다.');

			messages = [...messages, { role: 'assistant', text: reply, ts: Date.now() }];
			error = null;
			speakText(reply, {
				lang: 'en-US',
				onEnd: () => {
					freeBusy = false;
					startRecognitionSafe();
				}
			});
		} catch (e) {
			freeBusy = false;
			error = e instanceof Error ? e.message : String(e);
			errorHelpUrl = null;
			startRecognitionSafe();
		}
	}

	function startFree() {
		const Ctor = getSpeechRecognitionCtor();
		if (!Ctor) {
			throw new Error(
				'이 브라우저는 Web Speech 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.'
			);
		}

		stopFreeRecognition();
		recognition = new Ctor();
		recognition.lang = 'en-US';
		recognition.continuous = true;
		recognition.interimResults = true;

		recognition.onresult = (ev) => {
			if (status !== 'listening' || engine !== 'free' || freeBusy) return;

			let interim = '';
			let final = '';
			for (let i = ev.resultIndex; i < ev.results.length; i++) {
				const r = ev.results[i];
				const piece = r[0]?.transcript ?? '';
				if (r.isFinal) final += piece;
				else interim += piece;
			}
			isUserSpeaking = Boolean(interim) || Boolean(final && !ev.results[ev.results.length - 1]?.isFinal);

			if (!final.trim()) return;

			isUserSpeaking = false;
			handleFreeUserText(final);
		};

		recognition.onerror = (ev) => {
			if (ev.error === 'no-speech' || ev.error === 'aborted') return;
			error = `음성 인식: ${ev.error}`;
			errorHelpUrl = null;
			status = 'error';
			stopFreeRecognition();
		};

		recognition.onend = () => {
			if (status !== 'listening' || engine !== 'free') return;
			if (freeBusy) return;
			startRecognitionSafe();
		};

		try {
			recognition.start();
		} catch (e) {
			stopFreeRecognition();
			throw new Error(
				e instanceof Error ? e.message : '음성 인식을 시작할 수 없습니다. 마이크 권한을 확인해 주세요.'
			);
		}
		status = 'listening';
		messages = [{ role: 'system', text: SYSTEM_CONNECTED_FREE, ts: Date.now() }];
	}

	function float32ToPCM16Base64(float32) {
		// PCM16 little-endian, base64 encode raw bytes.
		const pcm16 = new Int16Array(float32.length);
		for (let i = 0; i < float32.length; i++) {
			const s = Math.max(-1, Math.min(1, float32[i]));
			pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		const bytes = new Uint8Array(pcm16.buffer);
		let binary = '';
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			const sub = bytes.subarray(i, i + chunkSize);
			binary += String.fromCharCode.apply(null, sub);
		}
		return btoa(binary);
	}

	function base64PCM16ToFloat32(base64) {
		const binary = atob(base64);
		const len = binary.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
		const pcm16 = new Int16Array(bytes.buffer);
		const out = new Float32Array(pcm16.length);
		for (let i = 0; i < pcm16.length; i++) out[i] = pcm16[i] / 32768;
		return out;
	}

	function resampleFloat32(input, fromRate, toRate) {
		if (fromRate === toRate) return input;
		if (!input.length) return input;
		const ratio = fromRate / toRate;
		const newLen = Math.max(1, Math.round(input.length / ratio));
		const out = new Float32Array(newLen);
		for (let i = 0; i < newLen; i++) {
			const pos = i * ratio;
			const idx = Math.floor(pos);
			const frac = pos - idx;
			const s0 = input[idx] ?? 0;
			const s1 = input[idx + 1] ?? s0;
			out[i] = s0 + (s1 - s0) * frac;
		}
		return out;
	}

	function clearPlayback() {
		playbackNode?.port.postMessage({ type: 'clear' });
	}

	/**
	 * @param {Float32Array} samples
	 */
	function pushPlayback(samples) {
		if (!playbackNode || !samples.length) return;
		playbackNode.port.postMessage({ type: 'push', samples }, [samples.buffer]);
	}

	async function registerAudioWorklets() {
		if (!audioCtx || workletsRegistered) return;
		await audioCtx.audioWorklet.addModule(captureWorkletUrl);
		await audioCtx.audioWorklet.addModule(playbackWorkletUrl);
		workletsRegistered = true;
	}

	async function ensureAudio() {
		// Must be called by a user gesture to allow audio playback.
		if (!audioCtx) {
			audioCtx = new (window.AudioContext || window.webkitAudioContext)({
				sampleRate: INPUT_SAMPLE_RATE
			});
			workletsRegistered = false;
		}
		await audioCtx.resume();
		await registerAudioWorklets();

		if (!playbackNode) {
			playbackNode = new AudioWorkletNode(audioCtx, 'realtime-playback-processor', {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [1]
			});
			playbackNode.connect(audioCtx.destination);
		}
	}

	async function startMicStreaming() {
		if (!audioCtx || !ws || ws.readyState !== WebSocket.OPEN) return;

		await registerAudioWorklets();

		micStream = await navigator.mediaDevices.getUserMedia({
			audio: true
		});
		micSource = audioCtx.createMediaStreamSource(micStream);

		captureNode = new AudioWorkletNode(audioCtx, 'realtime-capture-processor', {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			channelCount: 1
		});
		captureNode.port.onmessage = (e) => {
			if (!ws || ws.readyState !== WebSocket.OPEN) return;
			const input = /** @type {Float32Array} */ (e.data);
			if (!(input instanceof Float32Array) || !input.length) return;
			const fromRate = audioCtx.sampleRate;
			const pcm24k = resampleFloat32(input, fromRate, INPUT_SAMPLE_RATE);
			const base64 = float32ToPCM16Base64(pcm24k);
			ws.send(
				JSON.stringify({
					type: 'input_audio_buffer.append',
					audio: base64
				})
			);
		};

		const silentGain = audioCtx.createGain();
		silentGain.gain.value = 0;
		micSource.connect(captureNode);
		captureNode.connect(silentGain);
		silentGain.connect(audioCtx.destination);
	}

	function stopMicStreaming() {
		if (captureNode) {
			try {
				captureNode.port.onmessage = null;
				captureNode.disconnect();
			} catch {
				// ignore
			}
			captureNode = null;
		}

		if (micSource) {
			try {
				micSource.disconnect();
			} catch {
				// ignore
			}
			micSource = null;
		}

		if (micStream) {
			micStream.getTracks().forEach((t) => t.stop());
			micStream = null;
		}
	}

	async function start() {
		error = null;
		errorHelpUrl = null;
		keepErrorUiOnWsClose = false;
		status = 'connecting';
		streamingText = '';
		messages = [];
		currentResponseId = null;
		clearPlayback();
		cancelSpeech();
		stopFreeRecognition();
		freeBusy = false;

		if (engine === 'free') {
			try {
				startFree();
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				error = msg;
				errorHelpUrl = null;
				status = 'error';
			}
			return;
		}

		try {
			const resp = await fetch('/api/realtime/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					instructions:
						'You are a friendly English conversation tutor. Help the user practice spoken English: respond in clear, natural English, keep replies concise unless they ask for more, and gently correct major mistakes when helpful.'
				})
			});

			const data = await resp.json();
			if (!resp.ok) {
				errorHelpUrl = typeof data?.help_url === 'string' ? data.help_url : null;
				throw new Error(data?.error || '세션 생성에 실패했습니다.');
			}

			const token = data?.client_secret?.value;
			clientSecretValue = token;
			if (!clientSecretValue) throw new Error('client_secret.value가 없습니다.');

			// Create WebSocket connection to OpenAI Realtime
			const url = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
			const protocols = ['realtime', `openai-insecure-api-key.${clientSecretValue}`];

			ws = new WebSocket(url, protocols);

			ws.onopen = async () => {
				// AudioContext is audio-gesture gated; do it after user clicked start.
				await ensureAudio();
				status = 'listening';
				await startMicStreaming();
				messages = [...messages, { role: 'system', text: SYSTEM_CONNECTED_OPENAI, ts: Date.now() }];
			};

			ws.onmessage = (ev) => {
				let msg;
				try {
					msg = JSON.parse(ev.data);
				} catch {
					return;
				}
				if (!msg?.type) return;

				if (msg.type === 'input_audio_buffer.speech_started') {
					isUserSpeaking = true;
					clearPlayback();
					// Cancel current response generation when user starts speaking.
					try {
						ws?.send(JSON.stringify({ type: 'response.cancel' }));
					} catch {
						// ignore
					}
					return;
				}

				if (msg.type === 'input_audio_buffer.speech_stopped') {
					isUserSpeaking = false;
					return;
				}

				if (msg.type === 'response.output_text.delta') {
					if (msg.response_id && msg.response_id !== currentResponseId) {
						currentResponseId = msg.response_id;
						streamingText = '';
					}
					streamingText += msg.delta ?? '';
					return;
				}

				if (msg.type === 'response.output_text.done') {
					if (msg.response_id) currentResponseId = msg.response_id;
					const text = msg.text ?? streamingText ?? '';
					messages = [...messages, { role: 'assistant', text, ts: Date.now() }];
					streamingText = '';
					return;
				}

				// GA audio modality: spoken reply transcript streams here (not output_text).
				if (msg.type === 'response.output_audio_transcript.delta') {
					if (msg.response_id && msg.response_id !== currentResponseId) {
						currentResponseId = msg.response_id;
						streamingText = '';
					}
					streamingText += msg.delta ?? '';
					return;
				}

				if (msg.type === 'response.output_audio_transcript.done') {
					if (msg.response_id) currentResponseId = msg.response_id;
					const text = msg.transcript ?? streamingText ?? '';
					messages = [...messages, { role: 'assistant', text, ts: Date.now() }];
					streamingText = '';
					return;
				}

				if (msg.type === 'response.output_audio.delta') {
					const deltaB64 = msg.delta;
					if (!deltaB64) return;
					// Decode PCM16 -> float32
					const floats24k = base64PCM16ToFloat32(deltaB64);

					if (!audioCtx) return;
					const fromRate = INPUT_SAMPLE_RATE;
					const toRate = audioCtx.sampleRate;
					const floatsForCtx = resampleFloat32(floats24k, fromRate, toRate);
					pushPlayback(floatsForCtx);
					return;
				}

				if (msg.type === 'error') {
					const err = msg?.error;
					const code = typeof err?.code === 'string' ? err.code : undefined;
					const apiMessage = typeof err?.message === 'string' ? err.message : '';
					const formatted = formatOpenAiErrorForUser(code, apiMessage);
					keepErrorUiOnWsClose = true;
					error = formatted.message;
					errorHelpUrl = formatted.helpUrl;
					status = 'error';
					return;
				}
			};

			ws.onerror = () => {
				keepErrorUiOnWsClose = true;
				error = 'WebSocket 연결 오류가 발생했습니다.';
				errorHelpUrl = null;
				status = 'error';
			};

			ws.onclose = () => {
				if (!keepErrorUiOnWsClose) status = 'idle';
				keepErrorUiOnWsClose = false;
				isUserSpeaking = false;
				stopMicStreaming();
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (!errorHelpUrl) {
				const formatted = formatOpenAiErrorForUser(undefined, msg);
				error = formatted.message;
				errorHelpUrl = formatted.helpUrl;
			} else {
				error = msg;
			}
			status = 'error';
		}
	}

	function stop() {
		status = 'idle';
		isUserSpeaking = false;
		streamingText = '';
		error = null;
		errorHelpUrl = null;
		keepErrorUiOnWsClose = false;
		freeBusy = false;
		clearPlayback();
		cancelSpeech();
		stopFreeRecognition();

		try {
			ws?.close();
		} catch {
			// ignore
		}
		ws = null;

		stopMicStreaming();

		// Close AudioContext to release audio devices (better for deployment environments).
		if (audioCtx) {
			if (playbackNode) {
				try {
					playbackNode.disconnect();
				} catch {
					// ignore
				}
				playbackNode = null;
			}
			workletsRegistered = false;
			audioCtx.close().catch(() => {});
			audioCtx = null;
		}
	}

	onDestroy(() => {
		stop();
	});
</script>

<svelte:head>
	<title>실시간 영어회화 AI</title>
</svelte:head>

<div
	class="min-h-dvh bg-gradient-to-b from-slate-100 via-white to-indigo-50 text-slate-800 flex flex-col items-center px-4 py-10 sm:py-14"
>
	<div class="w-full max-w-lg space-y-8">
		<header class="text-center space-y-3">
			<h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
				실시간 영어회화 AI
			</h1>
			<p class="text-sm sm:text-base text-slate-600">
				{#if engine === 'free'}
					브라우저 음성 인식 + 로컬 Ollama로 연습합니다. OpenAI 결제 없이 사용할 수 있어요.
				{:else}
					OpenAI Realtime API로 자연스러운 영어 대화를 연습해보세요
				{/if}
			</p>
			<div
				class="flex rounded-xl bg-slate-100/90 p-1 text-xs sm:text-sm font-medium border border-slate-200/80"
				role="group"
				aria-label="대화 엔진 선택"
			>
				<button
					type="button"
					class="flex-1 rounded-lg py-2 px-2 transition {engine === 'free'
						? 'bg-white text-slate-900 shadow-sm'
						: 'text-slate-600 hover:text-slate-800'}"
					disabled={status === 'connecting' || status === 'listening'}
					onclick={() => (engine = 'free')}
				>
					무료 · Ollama
				</button>
				<button
					type="button"
					class="flex-1 rounded-lg py-2 px-2 transition {engine === 'openai'
						? 'bg-white text-slate-900 shadow-sm'
						: 'text-slate-600 hover:text-slate-800'}"
					disabled={status === 'connecting' || status === 'listening'}
					onclick={() => (engine = 'openai')}
				>
					OpenAI · 유료
				</button>
			</div>
		</header>

		<!-- Main mic card -->
		<div
			class="rounded-3xl bg-white/90 shadow-xl shadow-slate-200/60 border border-slate-200/80 px-6 py-10 sm:px-10 sm:py-12"
		>
			<div class="flex flex-col items-center gap-6">
				<div class="relative">
					<div
						class="rounded-full p-[4px] bg-gradient-to-br from-sky-400 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-200/50 {status ===
						'connecting'
							? 'animate-pulse'
							: ''}"
					>
						<button
							type="button"
							class="relative flex h-32 w-32 sm:h-36 sm:w-36 items-center justify-center rounded-full bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
							disabled={status === 'connecting' || status === 'listening'}
							onclick={() => start()}
							aria-label={status === 'idle' || status === 'error' ? '연결하고 대화 시작' : '마이크'}
						>
							<svg
								class="h-14 w-14 sm:h-16 sm:w-16 text-slate-600"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path
									d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z"
								/>
								<path d="M19 11a7 7 0 0 1-14 0" />
								<path d="M12 18v3" />
								<path d="M8 21h8" />
							</svg>
						</button>
					</div>
					{#if status === 'listening'}
						<span
							class="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white shadow"
							title="연결됨"
							aria-hidden="true"
						></span>
					{/if}
				</div>

				<div
					class="inline-flex items-center gap-2 rounded-full bg-sky-50 border border-sky-100 px-4 py-2 text-sm text-sky-900"
				>
					<span
						class="h-2 w-2 shrink-0 rounded-full {status === 'listening'
							? isUserSpeaking
								? 'bg-amber-500 animate-pulse'
								: 'bg-sky-500'
							: status === 'connecting'
								? 'bg-sky-400 animate-pulse'
								: 'bg-slate-300'}"
						aria-hidden="true"
					></span>
					<span>
						{#if status === 'connecting'}
							연결하는 중입니다…
						{:else if status === 'listening' && engine === 'free' && freeBusy}
							답변을 준비하거나 읽는 중이에요…
						{:else if status === 'listening'}
							{#if isUserSpeaking}
								말씀을 듣고 있어요…
							{:else}
								대화 준비 완료 - 자유롭게 말해보세요!
							{/if}
						{:else if status === 'error'}
							문제가 발생했습니다. 아래 안내를 확인해 주세요.
						{:else}
							마이크 버튼을 눌러 연결을 시작하세요.
						{/if}
					</span>
				</div>

				<div class="flex w-full max-w-xs flex-col sm:flex-row gap-3 justify-center">
					<button
						type="button"
						class="flex-1 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-3 px-4 shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
						disabled={status !== 'listening' && status !== 'connecting'}
						onclick={() => stop()}
					>
						연결 해제
					</button>
					<button
						type="button"
						class="flex-1 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold py-3 px-4 flex items-center justify-center gap-2 transition"
						onclick={() => (showDebug = !showDebug)}
					>
						<span aria-hidden="true">🔧</span>
						디버그
					</button>
				</div>

				{#if showDebug}
					<div
						class="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-left text-xs font-mono text-slate-600 space-y-2"
					>
						<p>engine: {engine}</p>
						<p>status: {status}</p>
						<p>freeBusy: {freeBusy}</p>
						<p>
							ws:
							{ws == null
								? 'null'
								: ws.readyState === WebSocket.CONNECTING
									? 'CONNECTING'
									: ws.readyState === WebSocket.OPEN
										? 'OPEN'
										: ws.readyState === WebSocket.CLOSING
											? 'CLOSING'
											: 'CLOSED'}
						</p>
						<p>isUserSpeaking: {isUserSpeaking}</p>
						<p>messages: {messages.length}</p>
						{#if engine === 'free'}
							<label class="block space-y-1 not-italic font-sans text-slate-700">
								<span class="text-[11px] uppercase tracking-wide text-slate-500">Ollama 모델</span>
								<input
									class="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono"
									bind:value={ollamaModel}
									disabled={status === 'listening' || status === 'connecting'}
								/>
							</label>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Conversation log -->
		<div
			class="rounded-3xl bg-white/90 shadow-lg shadow-slate-200/50 border border-slate-200/80 overflow-hidden"
		>
			<div
				class="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/80"
			>
				<h2 class="text-sm font-semibold text-slate-800">대화 기록</h2>
				<button
					type="button"
					class="text-xs font-medium text-sky-700 hover:text-sky-900 disabled:opacity-40"
					disabled={messages.length === 0 && !streamingText}
					onclick={() => clearHistory()}
				>
					기록 지우기
				</button>
			</div>
			<div class="max-h-[42vh] overflow-y-auto p-4 space-y-4">
				{#each messages as m (m.ts + m.role + m.text.slice(0, 48))}
					<div class="flex gap-3">
						<div
							class="shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-bold text-white {m.role ===
							'system'
								? 'bg-emerald-500'
								: m.role === 'assistant'
									? 'bg-violet-500'
									: 'bg-slate-500'}"
						>
							{m.role === 'system' ? 'AI' : m.role === 'assistant' ? 'A' : '나'}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2 flex-wrap">
								<span class="text-sm font-semibold text-slate-800">
									{m.role === 'system' ? '시스템' : m.role === 'assistant' ? '어시스턴트' : '나'}
								</span>
								<span class="text-xs text-slate-400 tabular-nums">{formatTime(m.ts)}</span>
							</div>
							<p class="mt-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{m.text}</p>
						</div>
					</div>
				{/each}
				{#if streamingText}
					<div class="flex gap-3">
						<div
							class="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white"
						>
							A
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<span class="text-sm font-semibold text-slate-800">어시스턴트</span>
								<span class="text-xs text-violet-500">입력 중…</span>
							</div>
							<p class="mt-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
								{streamingText}
							</p>
						</div>
					</div>
				{/if}
				{#if messages.length === 0 && !streamingText && status === 'idle'}
					<p class="text-center text-sm text-slate-400 py-6">연결 후 대화 내용이 여기에 표시됩니다.</p>
				{/if}
			</div>
		</div>

		{#if error}
			<div
				class="w-full rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900 space-y-2"
				role="alert"
			>
				<p class="leading-relaxed whitespace-pre-wrap font-medium">{error}</p>
				{#if errorHelpUrl}
					<button
						type="button"
						class="text-left text-rose-800 underline underline-offset-2 hover:text-rose-950 text-sm cursor-pointer bg-transparent border-0 p-0 font-sans"
						onclick={() =>
							errorHelpUrl && window.open(errorHelpUrl, '_blank', 'noopener,noreferrer')}
					>
						관련 페이지 열기 (새 탭)
					</button>
				{/if}
			</div>
		{/if}

		<p class="text-center text-xs text-slate-500 space-y-1">
			<span class="block"
				>마이크는 HTTPS 또는 localhost에서만 사용할 수 있습니다.</span
			>
			{#if engine === 'free'}
				<span class="block text-slate-600">
					무료 모드: PC에
					<a
						href="https://ollama.com"
						class="text-sky-700 underline underline-offset-2"
						target="_blank"
						rel="noopener noreferrer">Ollama</a
					>
					설치 후 터미널에서 <code class="text-slate-700">ollama pull {ollamaModel}</code> 로 모델을 받고 Ollama를
					켜 두세요.
				</span>
			{/if}
		</p>
	</div>
</div>

