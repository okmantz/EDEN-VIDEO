// WebGL2 renderer: layer drawing (transform + colour grade + mask + chroma key), effect passes,
// transitions, blend-mode compositing and procedural generators. All intermediate buffers are RGBA8,
// premultiplied alpha, "GL orientation" (sources are uploaded flipped), so the final canvas is upright.
import { GLSL_COMMON, VERT_FS, fxFragment, transFragment, EFFECTS, TRANSITIONS } from './effects.js';
import { genFragment, genById } from './generators.js';

const VERT_LAYER = `#version 300 es
in vec2 aPos;
uniform vec2 uCanvas; uniform vec2 uSize; uniform vec2 uOffset; uniform float uRot; uniform vec2 uFlip; uniform vec4 uCrop;
out vec2 vUv; out vec2 vLocal;
void main(){
  vec2 p = aPos * uSize;
  float c = cos(uRot), s = sin(uRot);
  p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + uOffset;
  gl_Position = vec4(p / (uCanvas*.5), 0., 1.);
  vLocal = aPos;
  vec2 u = aPos*uFlip + .5;
  vUv = vec2(mix(uCrop.x, 1.-uCrop.z, u.x), mix(uCrop.w, 1.-uCrop.y, u.y));
}`;

const FRAG_LAYER = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexSize; uniform vec2 uSize; uniform float uT; uniform float uSeed;
uniform vec4 uAdj0; uniform vec4 uAdj1; uniform vec4 uAdj2; uniform vec4 uAdj3;
uniform vec4 uLook0; uniform vec4 uLook1; uniform vec4 uLook2; uniform vec4 uLook3;
uniform vec4 uChroma; uniform vec2 uChromaP;
uniform vec4 uMask; uniform float uMaskRound;
uniform float uBlurLod; uniform float uDim;
in vec2 vUv; in vec2 vLocal; out vec4 o;
${GLSL_COMMON}
vec3 hueRot(vec3 c,float a){ float s=sin(a),k=cos(a); vec3 ax=vec3(.57735); return c*k+cross(ax,c)*s+ax*dot(ax,c)*(1.-k); }
float sdBox(vec2 p,vec2 b,float r){ vec2 d=abs(p)-b+r; return length(max(d,0.))+min(max(d.x,d.y),0.)-r; }
float sdHeart(vec2 p){ p.y+=.06; p.x=abs(p.x); p*=1.9; float a=p.x*p.x+p.y*p.y-1.; return (a*a*a-p.x*p.x*p.y*p.y*p.y)*.35; }
float sdStar(vec2 p,float r){ const vec2 k1=vec2(.809017,-.587785); const vec2 k2=vec2(-k1.x,k1.y); p.x=abs(p.x); p-=2.*max(dot(k1,p),0.)*k1; p-=2.*max(dot(k2,p),0.)*k2; p.x=abs(p.x); p.y-=r; vec2 ba=vec2(-.309017,.951057)*.45*r; float h=clamp(dot(p,ba)/dot(ba,ba),0.,1.); return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y); }
vec3 applyLook(vec3 c){
  float amt=uLook3.w; if(amt<=0.) return c;
  vec3 r=c; r=(r-.5)*uLook0.y+.5; r+=uLook0.z; float l=luma(r);
  r=mix(vec3(l),r,uLook0.x); r=mix(r,vec3(luma(r)),uLook2.w);
  r=uLook0.w+r*(1.-uLook0.w);
  vec3 tc=mix(uLook1.rgb,uLook2.rgb,smoothstep(.12,.88,luma(r)));
  r+=(tc-luma(tc))*uLook1.w*.7;
  r=pow(max(r,vec3(0.)),1./uLook3.rgb);
  return mix(c,r,amt);
}
vec3 grade(vec3 c,vec2 uv){
  c*=exp2(uAdj0.x);
  c+=vec3(uAdj0.y*.12,uAdj0.y*.02,-uAdj0.y*.12); c+=vec3(-uAdj0.z*.05,uAdj0.z*.09,-uAdj0.z*.05);
  c+=uAdj0.w*.4; c=(c-.5)*(1.+uAdj1.x)+.5;
  float l=luma(c); c+=uAdj2.y*(1.-smoothstep(0.,.55,l))*.4; c+=uAdj2.x*smoothstep(.45,1.,l)*.4;
  float l2=luma(c); float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)); float sat=mx-mn;
  c=mix(vec3(l2),c,1.+uAdj1.y+uAdj1.z*(1.-sat)); if(abs(uAdj1.w)>.0001) c=hueRot(c,uAdj1.w);
  c=applyLook(c);
  vec2 q=vUv-.5; c*=1.-uAdj2.w*smoothstep(.25,.85,length(vLocal*vec2(1.,1.))*1.15)*1.0;
  c+=(hash21(vUv*uSize+uSeed)-.5)*uAdj3.x*.35;
  return c;
}
float maskAlpha(){
  if(uMask.x<.5) return 1.;
  vec2 q=vLocal*uSize/min(uSize.x,uSize.y); float sc=uMask.y; float d;
  if(uMask.x<1.5) d=length(q)-.5*sc;
  else if(uMask.x<2.5){ vec2 hb=(uSize/min(uSize.x,uSize.y))*.5*sc; d=sdBox(q,hb,min(min(hb.x,hb.y),.5*uMaskRound*sc)); }
  else if(uMask.x<3.5) d=sdHeart(q/(sc*.62));
  else if(uMask.x<4.5) d=sdStar(q/(sc*.55),.5)*.55*sc;
  else if(uMask.x<5.5) d=(abs(q.x)+abs(q.y)-.55*sc)*.7071;
  else d=(q.x+ (1.-sc)*.5 )*(1.0);
  float f=max(uMask.z*.35,.002); float a=1.-smoothstep(-f,f,d);
  return uMask.w>.5?1.-a:a;
}
void main(){
  vec4 t;
  if(uBlurLod>0.){
    t=vec4(0.); vec2 px=uBlurLod/uTexSize*1.6;
    for(int i=0;i<9;i++){ vec2 o2=vec2(float(i%3)-1.,float(i/3)-1.)*px; t+=textureLod(uTex,vUv+o2,uBlurLod); }
    t/=9.; t.rgb*=uDim; o=t; return;
  }
  t=texture(uTex,vUv);
  float a=t.a; vec3 c=a>.0005?t.rgb/a:t.rgb;
  if(uAdj2.z>0.){ vec2 px=1./uTexSize; vec3 b=(texture(uTex,vUv+vec2(px.x,0.)).rgb+texture(uTex,vUv-vec2(px.x,0.)).rgb+texture(uTex,vUv+vec2(0.,px.y)).rgb+texture(uTex,vUv-vec2(0.,px.y)).rgb)*.25; c+=(c-b)*uAdj2.z*2.2; }
  c=grade(c,vUv);
  if(uChroma.w>0.){
    vec3 k=uChroma.rgb; vec3 cy=vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(-.169,-.331,.5))+.5,dot(c,vec3(.5,-.419,-.081))+.5);
    vec3 ky=vec3(dot(k,vec3(.299,.587,.114)),dot(k,vec3(-.169,-.331,.5))+.5,dot(k,vec3(.5,-.419,-.081))+.5);
    float d=length(cy.yz-ky.yz); float m=smoothstep(uChroma.w,uChroma.w+uChromaP.x+.001,d); a*=m;
    float spill=1.-smoothstep(uChroma.w,uChroma.w+uChromaP.x+uChromaP.y*.3+.001,d); c=mix(c,vec3(luma(c)),spill*uChromaP.y);
  }
  a*=maskAlpha();
  o=vec4(clamp(c,0.,1.)*a,a);
}`;

const FRAG_COMP = `#version 300 es
precision highp float;
uniform sampler2D uBase; uniform sampler2D uLayer; uniform float uOpacity; uniform int uMode;
in vec2 vUv; out vec4 o;
vec3 blendRGB(vec3 b,vec3 s){
  if(uMode==1) return 1.-(1.-b)*(1.-s);
  if(uMode==2) return b*s;
  if(uMode==3) return min(b+s,vec3(1.));
  if(uMode==4) return mix(2.*b*s,1.-2.*(1.-b)*(1.-s),step(.5,b));
  if(uMode==5) return mix(b-(1.-2.*s)*b*(1.-b),b+(2.*s-1.)*(sqrt(b)-b),step(.5,s));
  if(uMode==6) return max(b,s);
  if(uMode==7) return min(b,s);
  if(uMode==8) return abs(b-s);
  return s;
}
void main(){
  vec4 b=texture(uBase,vUv); vec4 l=texture(uLayer,vUv)*uOpacity;
  if(uMode==0){ o=l+b*(1.-l.a); return; }
  float a=l.a; vec3 s=a>.0005?l.rgb/a:vec3(0.);
  vec3 bl=blendRGB(b.rgb,s);
  o=vec4(mix(b.rgb,bl,a),max(b.a,a));
}`;

const FRAG_BLIT = `#version 300 es
precision highp float;
uniform sampler2D uTex; in vec2 vUv; out vec4 o;
void main(){ vec4 c=texture(uTex,vUv); o=vec4(c.rgb+(1.-c.a)*0.,1.); }`;

const BLEND_IDS = { normal: 0, screen: 1, multiply: 2, add: 3, overlay: 4, softlight: 5, lighten: 6, darken: 7, difference: 8 };

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', desynchronized: false });
    if (!gl) throw new Error('WebGL2 is not available on this device.');
    this.gl = gl;
    this.w = 0; this.h = 0;
    this.progs = new Map();
    this.sources = new Map();
    this.pool = [];
    this.inUse = [];
    this.frameN = 0;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.progs.clear(); this.sources.clear(); this.pool = []; this.inUse = []; this._init(); this.onRestore?.(); });
    this._init();
  }

  _init() {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  setSize(w, h) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    for (const f of [...this.pool, ...this.inUse]) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fb); }
    this.pool = []; this.inUse = [];
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
  }

  // ---------------------------------------------------------------- programs
  _compile(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader error: ' + log);
    }
    return s;
  }

  program(key, vs, fs) {
    let p = this.progs.get(key);
    if (p) return p;
    const gl = this.gl;
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(prog));
    } catch (e) {
      console.error('[gl] program', key, e.message);
      p = { prog: null, u: {}, bad: true };
      this.progs.set(key, p);
      return p;
    }
    p = { prog, u: new Proxy({}, { get: (t, n) => (n in t ? t[n] : (t[n] = gl.getUniformLocation(prog, n))) }) };
    this.progs.set(key, p);
    return p;
  }

  use(p) { if (p.bad) return false; this.gl.useProgram(p.prog); return true; }

  // ---------------------------------------------------------------- framebuffers
  fbo() {
    let f = this.pool.pop();
    if (!f) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      f = { tex, fb, w: this.w, h: this.h };
    }
    this.inUse.push(f);
    return f;
  }
  release(f) {
    const i = this.inUse.indexOf(f);
    if (i >= 0) { this.inUse.splice(i, 1); this.pool.push(f); }
  }
  beginFrame() { this.frameN++; while (this.inUse.length) this.pool.push(this.inUse.pop()); }

  bind(f) {
    const gl = this.gl;
    if (f) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.viewport(0, 0, f.w, f.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h); }
  }
  clear(f, r = 0, g = 0, b = 0, a = 0) { this.bind(f); this.gl.clearColor(r, g, b, a); this.gl.clear(this.gl.COLOR_BUFFER_BIT); }

  tex(unit, t) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  quad() { this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4); }

  // ---------------------------------------------------------------- source textures
  /** Upload (or refresh) a source. kind: 'video' refreshes every call; 'canvas' only when version changes. */
  upload(key, el, w, h, { version = null, mip = false } = {}) {
    const gl = this.gl;
    let s = this.sources.get(key);
    if (!s) {
      s = { tex: gl.createTexture(), w: 0, h: 0, version: null, mip: false, used: 0 };
      this.sources.set(key, s);
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    s.used = this.frameN;
    if (version != null && s.version === version && s.w === w && s.h === h && (!mip || s.mip)) return s;
    gl.bindTexture(gl.TEXTURE_2D, s.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    try {
      if (s.w === w && s.h === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, el);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    } catch (e) {
      console.warn('[gl] upload failed', e.message);
      return s.w ? s : null;
    }
    s.w = w; s.h = h; s.version = version; s.mip = mip;
    return s;
  }

  dropSource(key) { const s = this.sources.get(key); if (s) { this.gl.deleteTexture(s.tex); this.sources.delete(key); } }
  trimSources(maxAge = 240) {
    for (const [k, s] of this.sources) if (this.frameN - s.used > maxAge) { this.gl.deleteTexture(s.tex); this.sources.delete(k); }
  }

  // ---------------------------------------------------------------- passes
  /** Draw a source into target as a transformed, graded layer (premultiplied). */
  layer(target, src, o) {
    const gl = this.gl;
    const P = this.program('layer', VERT_LAYER, FRAG_LAYER);
    if (!this.use(P)) return;
    this.bind(target);
    const u = P.u;
    this.tex(0, src.tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uCanvas, this.w, this.h);
    gl.uniform2f(u.uTexSize, src.w, src.h);
    gl.uniform1f(u.uT, o.t || 0);
    gl.uniform1f(u.uSeed, o.seed || 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const setGeom = (disp, off, rot, flip, crop) => {
      gl.uniform2f(u.uSize, disp[0], disp[1]);
      gl.uniform2f(u.uOffset, off[0], off[1]);
      gl.uniform1f(u.uRot, rot);
      gl.uniform2f(u.uFlip, flip[0], flip[1]);
      gl.uniform4f(u.uCrop, crop[0], crop[1], crop[2], crop[3]);
    };
    if (o.bgBlur) {
      gl.uniform4f(u.uAdj0, 0, 0, 0, 0); gl.uniform4f(u.uAdj1, 0, 0, 0, 0); gl.uniform4f(u.uAdj2, 0, 0, 0, 0); gl.uniform4f(u.uAdj3, 0, 0, 0, 0);
      gl.uniform4f(u.uLook0, 1, 1, 0, 0); gl.uniform4f(u.uLook1, 0, 0, 0, 0); gl.uniform4f(u.uLook2, 0, 0, 0, 0); gl.uniform4f(u.uLook3, 1, 1, 1, 0);
      gl.uniform4f(u.uChroma, 0, 0, 0, 0); gl.uniform2f(u.uChromaP, 0, 0);
      gl.uniform4f(u.uMask, 0, 1, 0, 0); gl.uniform1f(u.uMaskRound, 0);
      gl.uniform1f(u.uBlurLod, o.bgBlur.lod); gl.uniform1f(u.uDim, o.bgBlur.dim);
      setGeom(o.bgBlur.disp, [0, 0], 0, [1, 1], [0, 0, 0, 0]);
      this.quad();
    }
    gl.uniform1f(u.uBlurLod, 0); gl.uniform1f(u.uDim, 1);
    const a = o.adj;
    gl.uniform4f(u.uAdj0, a.exp, a.temp, a.tint, a.bri);
    gl.uniform4f(u.uAdj1, a.con, a.sat, a.vib, a.hue);
    gl.uniform4f(u.uAdj2, a.hl, a.sh, a.sharp, a.vig);
    gl.uniform4f(u.uAdj3, a.grain, 0, 0, 0);
    const L = o.look;
    gl.uniform4f(u.uLook0, L.sat, L.con, L.bri, L.fade);
    gl.uniform4f(u.uLook1, L.sh[0], L.sh[1], L.sh[2], L.tint);
    gl.uniform4f(u.uLook2, L.hi[0], L.hi[1], L.hi[2], L.bw);
    gl.uniform4f(u.uLook3, L.gam[0], L.gam[1], L.gam[2], o.lookAmt);
    const ck = o.chroma;
    if (ck && ck.on) { gl.uniform4f(u.uChroma, ck.key[0], ck.key[1], ck.key[2], ck.sim); gl.uniform2f(u.uChromaP, ck.smooth, ck.spill); }
    else { gl.uniform4f(u.uChroma, 0, 0, 0, 0); gl.uniform2f(u.uChromaP, 0, 0); }
    const m = o.mask;
    if (m && m.type > 0) gl.uniform4f(u.uMask, m.type, m.scale, m.feather, m.invert ? 1 : 0);
    else gl.uniform4f(u.uMask, 0, 1, 0, 0);
    gl.uniform1f(u.uMaskRound, m ? m.round : 0.3);
    setGeom(o.disp, o.off, o.rot, o.flip, o.crop);
    this.quad();
    gl.disable(gl.BLEND);
  }

  /** Run an effect on `input`, writing into `out`. */
  effect(id, input, out, { amt = 1, t = 0, p = [0, 0, 0, 0] } = {}) {
    const def = EFFECTS.find((e) => e.id === id);
    if (!def) return false;
    const P = this.program('fx:' + id, VERT_FS, fxFragment(def.glsl));
    if (!this.use(P)) return false;
    const gl = this.gl;
    this.bind(out);
    this.tex(0, input.tex);
    gl.uniform1i(P.u.uTex, 0);
    gl.uniform2f(P.u.uRes, this.w, this.h);
    gl.uniform1f(P.u.uT, t);
    gl.uniform1f(P.u.uAmt, amt);
    gl.uniform4f(P.u.uP, p[0], p[1], p[2], p[3]);
    this.quad();
    return true;
  }

  transition(id, a, b, out, progress, t = 0) {
    const def = TRANSITIONS.find((e) => e.id === id) || TRANSITIONS[0];
    const P = this.program('tr:' + def.id, VERT_FS, transFragment(def.glsl));
    if (!this.use(P)) return false;
    const gl = this.gl;
    this.bind(out);
    this.tex(0, a.tex); this.tex(1, b.tex);
    gl.uniform1i(P.u.uA, 0); gl.uniform1i(P.u.uB, 1);
    gl.uniform2f(P.u.uRes, this.w, this.h);
    gl.uniform1f(P.u.uP, Math.min(1, Math.max(0, progress)));
    gl.uniform1f(P.u.uT, t);
    this.quad();
    return true;
  }

  generator(id, out, t) {
    const def = genById(id);
    if (!def) return false;
    const P = this.program('gen:' + id, VERT_FS, genFragment(def.glsl));
    if (!this.use(P)) return false;
    const gl = this.gl;
    this.bind(out);
    gl.uniform2f(P.u.uRes, this.w, this.h);
    gl.uniform1f(P.u.uT, t);
    this.quad();
    return true;
  }

  compose(base, layer, out, opacity = 1, mode = 'normal') {
    const P = this.program('comp', VERT_FS, FRAG_COMP);
    if (!this.use(P)) return;
    const gl = this.gl;
    this.bind(out);
    this.tex(0, base.tex); this.tex(1, layer.tex);
    gl.uniform1i(P.u.uBase, 0); gl.uniform1i(P.u.uLayer, 1);
    gl.uniform1f(P.u.uOpacity, opacity);
    gl.uniform1i(P.u.uMode, BLEND_IDS[mode] ?? 0);
    this.quad();
  }

  present(f) {
    const P = this.program('blit', VERT_FS, FRAG_BLIT);
    if (!this.use(P)) return;
    this.bind(null);
    this.tex(0, f.tex);
    this.gl.uniform1i(P.u.uTex, 0);
    this.quad();
  }

  /** Precompile a shader so the first use does not hitch. Returns true when it compiled. */
  warm(kind, id) {
    try {
      if (kind === 'fx') { const d = EFFECTS.find((e) => e.id === id); return !this.program('fx:' + id, VERT_FS, fxFragment(d.glsl)).bad; }
      if (kind === 'tr') { const d = TRANSITIONS.find((e) => e.id === id); return !this.program('tr:' + id, VERT_FS, transFragment(d.glsl)).bad; }
      if (kind === 'gen') { const d = genById(id); return !this.program('gen:' + id, VERT_FS, genFragment(d.glsl)).bad; }
    } catch (e) { return false; }
    return true;
  }

  destroy() {
    const gl = this.gl;
    for (const f of [...this.pool, ...this.inUse]) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fb); }
    for (const s of this.sources.values()) gl.deleteTexture(s.tex);
    this.sources.clear(); this.pool = []; this.inUse = [];
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
