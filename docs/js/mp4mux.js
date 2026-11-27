// Minimal MP4 muxer: one H.264 video track + one optional audio track (AAC or Opus).
// Pure JS, no dependencies. Samples are kept as Blob parts, so large exports don't live in the JS heap.
// Output is "fast start" (moov before mdat) so it plays and uploads everywhere.

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const str = (s) => [...s].map((c) => c.charCodeAt(0));
const cat = (...parts) => {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
function box(type, ...payload) {
  const body = cat(...payload.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p))));
  return cat(Uint8Array.from([...u32(body.length + 8), ...str(type)]), body);
}
const fullBox = (type, version, flags, ...payload) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...payload);

const MATRIX = [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];

export class Mp4Muxer {
  /**
   * @param {{width:number,height:number,fps:number}} video
   * @param {null|{codec:'aac'|'opus',sampleRate:number,channels:number,description?:Uint8Array}} audio
   */
  constructor(video, audio = null) {
    this.video = video;
    this.audio = audio;
    this.vSamples = []; // {data:Uint8Array, dts:ticks, dur:ticks, key:bool}
    this.aSamples = [];
    this.vScale = 90000;
    this.vDesc = null;
    this._vLastTs = null;
    this._firstVideoTs = null;
  }

  setVideoDescription(desc) { this.vDesc = desc instanceof Uint8Array ? desc : new Uint8Array(desc); }

  addVideoChunk(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.vDesc) this.setVideoDescription(meta.decoderConfig.description);
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    if (this._firstVideoTs == null) this._firstVideoTs = chunk.timestamp;
    this.vSamples.push({ data, ts: chunk.timestamp - this._firstVideoTs, key: chunk.type === 'key' });
  }

  addAudioChunk(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && this.audio && !this.audio.description) {
      this.audio.description = new Uint8Array(meta.decoderConfig.description);
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.aSamples.push({ data, ts: chunk.timestamp, dur: chunk.duration || 0 });
  }

  // Raw sample helpers (used by tests and the MediaRecorder-free paths)
  addVideoSample(data, tsUs, key) { if (this._firstVideoTs == null) this._firstVideoTs = tsUs; this.vSamples.push({ data, ts: tsUs - this._firstVideoTs, key }); }
  addAudioSample(data, tsUs, durUs) { this.aSamples.push({ data, ts: tsUs, dur: durUs }); }

  _videoTable() {
    const n = this.vSamples.length;
    const fpsTicks = Math.round(this.vScale / this.video.fps);
    const dts = new Array(n);
    const dur = new Array(n);
    for (let i = 0; i < n; i++) dts[i] = Math.round((this.vSamples[i].ts * this.vScale) / 1e6);
    for (let i = 0; i < n; i++) {
      dur[i] = i < n - 1 ? Math.max(1, dts[i + 1] - dts[i]) : fpsTicks;
    }
    return { dts, dur };
  }

  _audioTable() {
    const sr = this.audio.sampleRate;
    const n = this.aSamples.length;
    const dur = new Array(n);
    for (let i = 0; i < n; i++) {
      let d = this.audio.codec === 'aac' ? 1024 : Math.round(((this.aSamples[i].dur || 20000) * sr) / 1e6);
      dur[i] = d;
    }
    return { dur };
  }

  // Group samples into ~1 s chunks per track; returns [{track, start (s), samples:[...]}]
  _chunks() {
    const out = [];
    const groupBy = (samples, tsOf, track) => {
      let cur = null;
      for (let i = 0; i < samples.length; i++) {
        const t = tsOf(i);
        if (!cur || t - cur.start >= 1.0) { cur = { track, start: t, idx: [] }; out.push(cur); }
        cur.idx.push(i);
      }
    };
    groupBy(this.vSamples, (i) => this.vSamples[i].ts / 1e6, 'v');
    if (this.audio) {
      let acc = 0;
      const sr = this.audio.sampleRate;
      const { dur } = this._audioTable();
      const starts = dur.map((d) => { const s = acc / sr; acc += d; return s; });
      groupBy(this.aSamples, (i) => starts[i], 'a');
    }
    out.sort((a, b) => a.start - b.start || (a.track === 'v' ? -1 : 1));
    return out;
  }

  finalize() {
    if (!this.vDesc) throw new Error('Missing H.264 decoder configuration (avcC).');
    const chunks = this._chunks();
    const vt = this._videoTable();
    const at = this.audio ? this._audioTable() : null;

    // mdat layout
    let pos = 0;
    const layout = []; // {track, idx[], offset}
    for (const c of chunks) {
      const samples = c.track === 'v' ? this.vSamples : this.aSamples;
      let size = 0;
      for (const i of c.idx) size += samples[i].data.length;
      layout.push({ ...c, offset: pos, size });
      pos += size;
    }
    const mdatSize = pos;
    const build = (mdatStart) => {
      const vChunks = layout.filter((l) => l.track === 'v');
      const aChunks = layout.filter((l) => l.track === 'a');
      const vTrak = this._trak(1, 'v', vChunks.map((c) => mdatStart + c.offset), vChunks, vt);
      const aTrak = this.audio ? this._trak(2, 'a', aChunks.map((c) => mdatStart + c.offset), aChunks, at) : null;
      const vDurMs = Math.round(((vt.dts[vt.dts.length - 1] + vt.dur[vt.dur.length - 1]) * 1000) / this.vScale);
      let aDurMs = 0;
      if (this.audio) { let s = 0; for (const d of at.dur) s += d; aDurMs = Math.round((s * 1000) / this.audio.sampleRate); }
      const durMs = Math.max(vDurMs, aDurMs);
      const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MATRIX, new Array(24).fill(0), u32(this.audio ? 3 : 2));
      return box('moov', mvhd, vTrak, aTrak || new Uint8Array(0));
    };
    const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    const dummy = build(0);
    const mdatHeaderLen = mdatSize + 8 > 0xffffffff ? 16 : 8;
    const start = ftyp.length + dummy.length + mdatHeaderLen;
    const moov = build(start);
    const mdatHeader = mdatHeaderLen === 8
      ? Uint8Array.from([...u32(mdatSize + 8), ...str('mdat')])
      : Uint8Array.from([...u32(1), ...str('mdat'), ...u32(Math.floor((mdatSize + 16) / 2 ** 32)), ...u32((mdatSize + 16) >>> 0)]);
    const parts = [ftyp, moov, mdatHeader];
    for (const l of layout) {
      const samples = l.track === 'v' ? this.vSamples : this.aSamples;
      for (const i of l.idx) parts.push(samples[i].data);
    }
    return new Blob(parts, { type: 'video/mp4' });
  }

  _trak(id, kind, offsets, chunkLayout, table) {
    const isV = kind === 'v';
    const samples = isV ? this.vSamples : this.aSamples;
    const scale = isV ? this.vScale : this.audio.sampleRate;
    let total = 0;
    for (const d of table.dur) total += d;
    const durMs = Math.round((total * 1000) / scale);
    const tkhd = fullBox('tkhd', 0, 7, u32(0), u32(0), u32(id), u32(0), u32(durMs), u32(0), u32(0), u16(0), u16(0), u16(isV ? 0 : 0x0100), u16(0), MATRIX, u32(isV ? this.video.width << 16 : 0), u32(isV ? this.video.height << 16 : 0));
    const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(scale), u32(total), u16(0x55c4), u16(0));
    const hdlr = fullBox('hdlr', 0, 0, u32(0), str(isV ? 'vide' : 'soun'), u32(0), u32(0), u32(0), str(isV ? 'VideoHandler' : 'SoundHandler'), [0]);
    const mediaHeader = isV ? fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)) : fullBox('smhd', 0, 0, u16(0), u16(0));
    const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
    const stsd = isV ? this._avc1() : this._audioEntry();
    // stts: run-length of durations
    const runs = [];
    for (const d of table.dur) {
      if (runs.length && runs[runs.length - 1][1] === d) runs[runs.length - 1][0]++;
      else runs.push([1, d]);
    }
    const stts = fullBox('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => cat(Uint8Array.from(u32(c)), Uint8Array.from(u32(d)))));
    // stsc: runs of samples-per-chunk
    const stscRuns = [];
    chunkLayout.forEach((c, i) => {
      const n = c.idx.length;
      if (!stscRuns.length || stscRuns[stscRuns.length - 1][1] !== n) stscRuns.push([i + 1, n]);
    });
    const stsc = fullBox('stsc', 0, 0, u32(stscRuns.length), ...stscRuns.map(([f, n]) => cat(Uint8Array.from(u32(f)), Uint8Array.from(u32(n)), Uint8Array.from(u32(1)))));
    const stsz = fullBox('stsz', 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length)));
    const stco = fullBox('stco', 0, 0, u32(offsets.length), ...offsets.map((o) => u32(o)));
    const parts = [stsd, stts, stsc, stsz, stco];
    if (isV) {
      const keys = [];
      samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
      if (keys.length) parts.push(fullBox('stss', 0, 0, u32(keys.length), ...keys.map((k) => u32(k))));
    }
    const stbl = box('stbl', ...parts);
    const minf = box('minf', mediaHeader, dinf, stbl);
    const mdia = box('mdia', mdhd, hdlr, minf);
    return box('trak', tkhd, mdia);
  }

  _avc1() {
    const { width, height } = this.video;
    const avcC = box('avcC', this.vDesc);
    const entry = box('avc1', new Array(6).fill(0), u16(1), u16(0), u16(0), u32(0), u32(0), u32(0), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), new Array(32).fill(0), u16(0x0018), u16(0xffff), avcC);
    return fullBox('stsd', 0, 0, u32(1), entry);
  }

  _audioEntry() {
    const { codec, sampleRate, channels } = this.audio;
    const head = [new Array(6).fill(0), u16(1), u32(0), u32(0), u16(channels), u16(16), u16(0), u16(0), u32(Math.min(sampleRate, 65535) << 16)];
    if (codec === 'aac') {
      const asc = this.audio.description || cat(Uint8Array.from([0x12, 0x10]));
      const dsi = cat(Uint8Array.from([0x05, asc.length]), asc);
      const dcd = cat(Uint8Array.from([0x04, 13 + dsi.length, 0x40, 0x15, 0, 0, 0, ...u32(0), ...u32(0)]), dsi);
      const esd = cat(Uint8Array.from([0x03, 3 + dcd.length + 3, 0, 2, 0]), dcd, Uint8Array.from([0x06, 0x01, 0x02]));
      const esds = fullBox('esds', 0, 0, esd);
      return fullBox('stsd', 0, 0, u32(1), box('mp4a', ...head, esds));
    }
    // Opus in MP4
    const dOps = box('dOps', [0, channels, ...u16(312), ...u32(sampleRate), ...u16(0), 0]);
    return fullBox('stsd', 0, 0, u32(1), box('Opus', ...head, dOps));
  }
}
