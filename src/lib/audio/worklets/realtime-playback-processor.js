/* global AudioWorkletProcessor, registerProcessor */
// AudioWorklet: queue of Float32 chunks → speaker (replaces ScriptProcessor playback)
class RealtimePlaybackProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		/** @type {Float32Array[]} */
		this._queue = [];
		/** @type {Float32Array | null} */
		this._current = null;
		this._offset = 0;

		this.port.onmessage = (e) => {
			const d = e.data;
			if (d?.type === 'clear') {
				this._queue = [];
				this._current = null;
				this._offset = 0;
				return;
			}
			if (d?.type === 'push' && d.samples?.length) {
				this._queue.push(d.samples);
			}
		};
	}

	process(_inputs, outputs) {
		const out = outputs[0][0];
		for (let i = 0; i < out.length; i++) {
			while ((!this._current || this._offset >= this._current.length) && this._queue.length) {
				this._current = this._queue.shift() ?? null;
				this._offset = 0;
			}
			if (this._current && this._offset < this._current.length) {
				out[i] = this._current[this._offset++];
			} else {
				out[i] = 0;
			}
		}
		return true;
	}
}

registerProcessor('realtime-playback-processor', RealtimePlaybackProcessor);
