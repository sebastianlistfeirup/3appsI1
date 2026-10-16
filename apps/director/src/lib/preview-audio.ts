import { duckGain } from "@tre/scene-format";
type Channel = {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  kind: "voice" | "music" | "clip";
};
/** Local preview graph. The export still passes through validated FFmpeg assembly. */
export class PreviewAudio {
  readonly context: AudioContext;
  private channels = new Map<string, Channel>();
  private sources = new WeakMap<
    HTMLMediaElement,
    MediaElementAudioSourceNode
  >();
  private voice: AnalyserNode;
  private meter: AnalyserNode;
  private duck: GainNode;
  private master: DynamicsCompressorNode;
  private voiceSamples = new Float32Array(1024);
  private masterSamples = new Float32Array(1024);
  constructor() {
    this.context = new AudioContext();
    this.voice = this.context.createAnalyser();
    this.meter = this.context.createAnalyser();
    this.duck = this.context.createGain();
    this.master = this.context.createDynamicsCompressor();
    this.voice.fftSize = 1024;
    this.meter.fftSize = 1024;
    this.master.threshold.value = -1;
    this.master.knee.value = 0;
    this.master.ratio.value = 20;
    this.master.attack.value = 0.003;
    this.master.release.value = 0.1;
    this.voice.connect(this.master);
    this.duck.connect(this.master);
    this.master.connect(this.meter);
    this.meter.connect(this.context.destination);
  }
  register(key: string, element: HTMLMediaElement, kind: Channel["kind"]) {
    const source =
        this.sources.get(element) ??
        this.context.createMediaElementSource(element),
      gain = this.context.createGain();
    this.sources.set(element, source);
    source.connect(gain);
    gain.connect(
      kind === "voice"
        ? this.voice
        : kind === "music"
          ? this.duck
          : this.master,
    );
    gain.gain.value = 0;
    this.channels.set(key, { source, gain, kind });
    return () => {
      source.disconnect();
      gain.disconnect();
      this.channels.delete(key);
    };
  }
  gain(key: string, value: number) {
    const channel = this.channels.get(key);
    if (channel)
      channel.gain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, value)),
        this.context.currentTime,
        0.01,
      );
  }
  async suspend() {
    if (this.context.state === "running") await this.context.suspend();
  }
  async resume() {
    await this.context.resume();
  }
  sample(duck: boolean) {
    this.voice.getFloatTimeDomainData(this.voiceSamples);
    const rms = Math.sqrt(
        this.voiceSamples.reduce((n, v) => n + v * v, 0) /
          this.voiceSamples.length,
      ),
      target = duck ? duckGain(rms) : 1;
    this.duck.gain.setTargetAtTime(
      target,
      this.context.currentTime,
      target < this.duck.gain.value ? 0.08 : 0.6,
    );
    this.meter.getFloatTimeDomainData(this.masterSamples);
    return Math.sqrt(
      this.masterSamples.reduce((n, v) => n + v * v, 0) /
        this.masterSamples.length,
    );
  }
  duckLevel() {
    return this.duck.gain.value;
  }
  close() {
    this.channels.forEach((c) => {
      c.source.disconnect();
      c.gain.disconnect();
    });
    this.channels.clear();
    void this.context.close();
  }
}
