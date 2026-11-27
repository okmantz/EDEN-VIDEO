// In-browser speech-to-text (Whisper, via transformers.js). Runs on this device; only the model download uses the network,
// and the browser keeps it afterwards, so later runs work offline.
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
export const MODELS = {
  fast: { id: 'Xenova/whisper-tiny.en', label: 'Fast (English, ~40 MB)', en: true },
  accurate: { id: 'Xenova/whisper-base.en', label: 'Accurate (English, ~80 MB)', en: true },
  multi: { id: 'Xenova/whisper-base', label: 'Other languages (~80 MB)', en: false },
};

let lib = null;
const pipes = new Map();

async function load() {
  if (!lib) lib = await import(/* @vite-ignore */ LIB);
  return lib;
}

/** Mono 16 kHz samples from a decoded AudioBuffer (what Whisper expects). */
export async function toMono16k(buffer) {
  const rate = 16000;
  const len = Math.ceil(buffer.duration * rate);
  const ctx = new OfflineAudioContext(1, len, rate);
  const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination); src.start();
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

/**
 * Transcribe a decoded AudioBuffer. Returns [{text, start, end}] in seconds.
 * onProgress(0..1, label) reports the download first, then the listening.
 */
export async function transcribe(buffer, { model = 'accurate', language = null, onProgress = () => {} } = {}) {
  const spec = MODELS[model] || MODELS.accurate;
  const { pipeline } = await load();
  let p = pipes.get(spec.id);
  if (!p) {
    const device = typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm';
    const files = new Map();
    const progress_callback = (e) => {
      if (e.status === 'progress' && e.file) { files.set(e.file, e); let loaded = 0, total = 0; files.forEach((f) => { loaded += f.loaded || 0; total += f.total || 0; }); if (total) onProgress(Math.min(0.99, loaded / total), 'Downloading speech model'); }
    };
    const make = (dev) => pipeline('automatic-speech-recognition', spec.id, dev === 'webgpu'
      ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback }
      : { dtype: 'q8', progress_callback });
    try { p = await make(device); } catch (e) { if (device !== 'wasm') p = await make('wasm'); else throw e; }
    pipes.set(spec.id, p);
  }
  onProgress(0, 'Listening to your video');
  const audio = await toMono16k(buffer);
  const opts = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
  if (!spec.en) { opts.task = 'transcribe'; if (language) opts.language = language; }
  const res = await p(audio, opts);
  const words = (res.chunks || []).map((c) => ({ text: String(c.text || '').trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 }))
    .filter((w) => w.text && Number.isFinite(w.start));
  // Whisper can return a null end for the last word, and slightly overlapping times: tidy both.
  for (let i = 0; i < words.length; i++) {
    const nx = words[i + 1];
    if (!(words[i].end > words[i].start)) words[i].end = words[i].start + 0.3;
    if (nx && words[i].end > nx.start) words[i].end = Math.max(words[i].start + 0.05, nx.start);
  }
  return words;
}

/** Parse .srt / .vtt into approximate words (times are spread evenly across each cue). */
export function wordsFromSubtitles(text) {
  const norm = text.replace(/\r/g, '').replace(/^﻿/, '');
  const re = /(?:^|\n)(?:\d+\n)?(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{1,3}) --> (\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\n|\n*$)/g;
  const sec = (hh, mm, ss, ms) => (hh ? parseInt(hh) : 0) * 3600 + parseInt(mm) * 60 + parseInt(ss) + parseInt(ms.padEnd(3, '0')) / 1000;
  const words = []; let m;
  while ((m = re.exec(norm))) {
    const s = sec(m[1], m[2], m[3], m[4]), e = sec(m[5], m[6], m[7], m[8]);
    const toks = m[9].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
    toks.forEach((t, i) => words.push({ text: t, start: s + ((e - s) * i) / toks.length, end: s + ((e - s) * (i + 1)) / toks.length - 0.02 }));
  }
  return words;
}
