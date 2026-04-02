/* global AudioWorkletProcessor, registerProcessor */
// AudioWorklet: mic → main thread (Float32 per render quantum)
class RealtimeCaptureProcessor extends AudioWorkletProcessor {
	process(inputs, outputs) {
		const ch0 = inputs[0]?.[0];
		if (ch0?.length) {
			const copy = new Float32Array(ch0.length);
			copy.set(ch0);
			this.port.postMessage(copy, [copy.buffer]);
		}
		const out = outputs[0]?.[0];
		if (out) out.fill(0);
		return true;
	}
}

registerProcessor('realtime-capture-processor', RealtimeCaptureProcessor);
