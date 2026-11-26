class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._targetRate = 16000;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];

    // Downsample from AudioContext sampleRate (e.g. 48000 / 44100) to 16000 Hz
    const ratio = sampleRate / this._targetRate;
    for (let i = 0; i < channelData.length; i += ratio) {
      const idx = Math.floor(i);
      const sample = Math.max(-1, Math.min(1, channelData[idx]));
      this._buffer.push(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
    }

    // Flush ~80ms frames (1280 samples @ 16kHz) for ultra-low latency streaming
    while (this._buffer.length >= 1280) {
      const frame = this._buffer.splice(0, 1280);
      const int16 = new Int16Array(frame);
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
