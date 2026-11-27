// Export: frame-accurate WebCodecs (H.264 + AAC/Opus in MP4), with a real-time MediaRecorder fallback.
import { Renderer } from './gl.js';
import { Compositor } from './compose.js';
import { Mp4Muxer } from './mp4mux.js';
import { renderMix, hasAnyAudio } from './audio.js';
import { projectDuration } from './model.js';
import { clamp, sleep } from './util.js';

export const RESOLUTIONS = [
  { id: '480', name: '480p', short: 480 }, { id: '720', name: '720p HD', short: 720 }, { id: '1080', name: '1080p Full HD', short: 1080 },
  { id: '1440', name: '2K', short: 1440 }, { id: '2160', name: '4K', short: 2160 },
];
export const QUALITY = { high: 0.2, medium: 0.12, low: 0.07 };

export function outputSize(project, shortEdge) {
  const { w, h } = project.canvas;
  const k = shortEdge / Math.min(w, h);
  let W = Math.round((w * k) / 2) * 2, H = Math.round((h * k) / 2) * 2;
  const maxLong = 4096;
  if (Math.max(W, H) > maxLong) { const s = maxLong / Math.max(W, H); W = Math.round((W * s) / 2) * 2; H = Math.round((H * s) / 2) * 2; }
  return { W, H };
}

function avcCodec(W, H, fps) {
  const mbs = Math.ceil(W / 16) * Math.ceil(H / 16);
  const mbps = mbs * fps;
  if (mbs <= 8192 && mbps <= 245760) return ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
  if (mbs <= 8704 && mbps <= 522240) return ['avc1.64002a', 'avc1.4d002a', 'avc1.640028'];
  return ['avc1.640033', 'avc1.64002a', 'avc1.640028'];
}

export async function capabilities() {
  const cap = { webcodecs: typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined', aac: false, opus: false, h264: false, recorder: typeof MediaRecorder !== 'undefined' };
  if (cap.webcodecs) {
    try { cap.h264 = (await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1280, height: 720, bitrate: 4e6, framerate: 30, avc: { format: 'avc' } })).supported; } catch {}
    if (typeof AudioEncoder !== 'undefined') {
      try { cap.aac = (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 })).supported; } catch {}
      try { cap.opus = (await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch {}
    }
  }
  return cap;
}

/** Hidden video elements that are seeked frame-by-frame for deterministic export. */
class ExportProvider {
  constructor(lib, project) { this.lib = lib; this.project = project; this.vids = new Map(); this.imgs = new Map(); this.n = 0; }
  async getVideo(clip) {
    let e = this.vids.get(clip.id);
    if (e) return e;
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
    v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px;opacity:0';
    document.body.append(v);
    v.src = this.lib.url(clip.mediaId);
    await new Promise((res) => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 10000); });
    e = { v, last: this.n };
    this.vids.set(clip.id, e);
    return e;
  }
  async prepare(reqs) {
    this.n++;
    await Promise.all(reqs.map(async ({ clip, srcT }) => {
      if (clip.kind === 'image') { if (!this.imgs.has(clip.mediaId)) this.imgs.set(clip.mediaId, await this.lib.image(clip.mediaId)); return; }
      const e = await this.getVideo(clip);
      e.last = this.n;
      const dur = this.project.media[clip.mediaId]?.duration || e.v.duration || 0;
      const tt = clamp(srcT, 0, Math.max(0, dur - 0.04));
      if (Math.abs(e.v.currentTime - tt) < 0.0005 && e.v.readyState >= 2) return;
      await new Promise((res) => {
        const done = () => { e.v.removeEventListener('seeked', done); clearTimeout(to); res(); };
        const to = setTimeout(done, 6000);
        e.v.addEventListener('seeked', done);
        e.v.currentTime = tt;
      });
    }));
    if (this.n % 90 === 0) for (const [id, e] of this.vids) if (this.n - e.last > 120) { e.v.removeAttribute('src'); e.v.load(); e.v.remove(); this.vids.delete(id); }
  }
  frame(clip) {
    if (clip.kind === 'image') { const i = this.imgs.get(clip.mediaId); return i ? { el: i, w: i.naturalWidth, h: i.naturalHeight, version: 'img' } : null; }
    const e = this.vids.get(clip.id);
    if (!e || !e.v.videoWidth) return null;
    return { el: e.v, w: e.v.videoWidth, h: e.v.videoHeight };
  }
  destroy() { for (const e of this.vids.values()) { e.v.removeAttribute('src'); e.v.load(); e.v.remove(); } this.vids.clear(); }
}

export async function exportWebCodecs({ project, lib, bank, res, fps, quality, normalize, onProgress, signal, cap }) {
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Add some clips to the timeline first.');
  const { W, H } = outputSize(project, res.short);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const withAudio = hasAnyAudio(project, bank);
  const audioCodec = !withAudio ? null : cap.aac ? 'aac' : cap.opus ? 'opus' : null;
  if (withAudio && !audioCodec) throw new Error('NO_AUDIO_ENCODER');

  const canvas = document.createElement('canvas');
  const rend = new Renderer(canvas);
  rend.setSize(W, H);
  const provider = new ExportProvider(lib, project);
  const comp = new Compositor(rend, provider);
  const bitrate = Math.round(W * H * fps * (QUALITY[quality] || 0.12));

  // ---- audio first (offline render is fast)
  let audioBuf = null;
  const sr = 48000;
  if (audioCodec) { onProgress?.({ stage: 'Mixing audio', pct: 0 }); audioBuf = await renderMix(project, bank, duration, sr, normalize); }
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

  const mux = new Mp4Muxer({ width: W, height: H, fps }, audioCodec ? { codec: audioCodec, sampleRate: sr, channels: 2 } : null);
  let encError = null;
  let vcfg = null;
  for (const codec of avcCodec(W, H, fps)) {
    const c = { codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' }, hardwareAcceleration: 'no-preference' };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { vcfg = c; break; } } catch {}
  }
  if (!vcfg) throw new Error('H.264 encoding is not available in this browser.');
  const venc = new VideoEncoder({ output: (chunk, meta) => mux.addVideoChunk(chunk, meta), error: (e) => { encError = e; } });
  venc.configure(vcfg);

  let aenc = null;
  if (audioCodec) {
    aenc = new AudioEncoder({ output: (chunk, meta) => mux.addAudioChunk(chunk, meta), error: (e) => { encError = e; } });
    aenc.configure(audioCodec === 'aac' ? { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: 2, bitrate: 160000 } : { codec: 'opus', sampleRate: sr, numberOfChannels: 2, bitrate: 128000 });
    const L = audioBuf.getChannelData(0), R = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L;
    const chunk = 4096;
    for (let i = 0; i < L.length; i += chunk) {
      const n = Math.min(chunk, L.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / sr) * 1e6), data });
      aenc.encode(ad); ad.close();
      if (aenc.encodeQueueSize > 32) await sleep(0);
    }
    await aenc.flush();
    if (encError) throw encError;
  }

  const t0 = performance.now();
  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (encError) throw encError;
      const t = i / fps;
      await provider.prepare(comp.requests(project, t));
      comp.renderFrame(project, t);
      const vf = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) await sleep(2);
      if (i % 3 === 0) {
        const el = (performance.now() - t0) / 1000;
        onProgress?.({ stage: 'Rendering', pct: (i + 1) / totalFrames, eta: i > 5 ? (el / (i + 1)) * (totalFrames - i - 1) : null, frame: i + 1, total: totalFrames });
        await sleep(0);
      }
    }
    await venc.flush();
    if (encError) throw encError;
  } finally {
    try { venc.close(); } catch {}
    try { aenc?.close(); } catch {}
    provider.destroy();
    rend.destroy();
  }
  onProgress?.({ stage: 'Finishing', pct: 1 });
  const blob = mux.finalize();
  return { blob, ext: 'mp4', W, H, fps, audio: audioCodec };
}

/** Fallback: record the live preview in real time with MediaRecorder. */
export async function exportRealtime({ engine, project, res, fps, onProgress, signal }) {
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Add some clips to the timeline first.');
  if (!engine.actx) await engine.unlockAudio();
  const { W, H } = outputSize(project, Math.min(res.short, 1080));
  const prevEdge = engine.previewEdge;
  engine.pause();
  engine.previewEdge = Math.max(W, H);
  engine.applySize();
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('This browser cannot record video.');
  const stream = engine.canvas.captureStream(fps);
  const dest = engine.actx.createMediaStreamDestination();
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  engine.audioDest = dest;
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(W * H * fps * 0.14) });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  engine.seek(0, true);
  rec.start(500);
  await engine.play();
  const onTime = (t) => onProgress?.({ stage: 'Recording in real time', pct: Math.min(1, t / duration) });
  const off = engine.on('time', onTime);
  await new Promise((res) => { const o2 = engine.on('ended', () => { o2(); res(); }); const chk = setInterval(() => { if (signal?.aborted) { clearInterval(chk); engine.pause(); res(); } }, 200); });
  off();
  rec.stop();
  await stopped;
  engine.audioDest = null;
  engine.previewEdge = prevEdge; engine.applySize(); engine.seek(0);
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const type = rec.mimeType || mime;
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', W, H, fps, audio: 'realtime' };
}
