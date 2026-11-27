// Effect, transition, filter and animation catalogs. Shaders are GLSL ES 3.00 snippets.

export const GLSL_COMMON = `
float hash(float n){return fract(sin(n*127.1)*43758.5453123);}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 hash22(vec2 p){float n=hash21(p);return vec2(n,hash21(p+n+17.3));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+vec2(7.3,2.1);a*=.5;}return s;}
mat2 rot2(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
const float PI=3.14159265359;
`;

import { EXTRA_TRANSITIONS, EXTRA_EFFECTS, EXTRA_FILTERS } from './effects-extra.js';

export const VERT_FS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos + .5; gl_Position = vec4(aPos*2., 0., 1.); }`;

export const fxFragment = (body) => `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uT; uniform float uAmt; uniform vec4 uP;
in vec2 vUv; out vec4 o;
${GLSL_COMMON}
vec4 S(vec2 uv){ return texture(uTex, uv); }
float aspect(){ return uRes.x/uRes.y; }
${body}
void main(){ o = effect(vUv); }`;

export const transFragment = (body) => `#version 300 es
precision highp float;
uniform sampler2D uA; uniform sampler2D uB; uniform vec2 uRes; uniform float uP; uniform float uT;
in vec2 vUv; out vec4 o;
${GLSL_COMMON}
vec4 A(vec2 uv){ return texture(uA, uv); }
vec4 B(vec2 uv){ return texture(uB, uv); }
float aspect(){ return uRes.x/uRes.y; }
bool in01(vec2 u){ return u.x>=0.&&u.x<=1.&&u.y>=0.&&u.y<=1.; }
${body}
void main(){ o = transition(vUv, uP); }`;

const P = (k, name, min, max, def, step) => ({ k, name, min, max, def, step: step || (max - min) / 100 });
const INT = P('amt', 'Intensity', 0, 1, 0.7);
const SPD = (def = 1) => P('p0', 'Speed', 0.1, 4, def, 0.05);

// ------------------------------------------------------------------ EFFECTS
// cat: which group the effect lives in. Each body defines: vec4 effect(vec2 uv)
export const EFFECTS = [
  // ---- Glitch & retro
  { id: 'glitch', name: 'Glitch', cat: 'Glitch', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 float t=floor(uT*uP.x*10.);
 float band=floor(uv.y*mix(8.,34.,hash(t)));
 float r=hash(band+t*7.31);
 float on=step(1.-uAmt*0.5,r);
 float off=(hash(band*3.7+t)-.5)*.3*on;
 vec2 u=uv+vec2(off,0.);
 float sp=.014*uAmt*(on+.3*step(.88,hash(t*1.7)));
 return vec4(S(u+vec2(sp,0.)).r,S(u).g,S(u-vec2(sp,0.)).b,S(u).a);
}` },
  { id: 'rgbsplit', name: 'RGB Split', cat: 'Glitch', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec2 d=normalize(vec2(1.,.35))*uAmt*.022*(.6+.4*sin(uT*uP.x*7.));
 return vec4(S(uv+d).r,S(uv).g,S(uv-d).b,S(uv).a);
}` },
  { id: 'vhs', name: 'VHS', cat: 'Glitch', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 float t=uT*uP.x;
 float wob=sin(uv.y*40.+t*6.)*.0016*uAmt+ (hash(floor(t*14.))-.5)*.004*uAmt*step(.92,hash(floor(uv.y*60.)+floor(t*9.)));
 vec2 u=uv+vec2(wob,0.);
 float track=smoothstep(.0,.04,abs(fract(uv.y*1.0-t*.15)-.5)-.47)*uAmt;
 u.x+=track*.03*sin(uv.y*200.);
 vec3 c=vec3(S(u+vec2(.004*uAmt,0.)).r,S(u).g,S(u-vec2(.004*uAmt,0.)).b);
 c*=1.-.14*uAmt*(.5+.5*sin(uv.y*uRes.y*1.2));
 c+=(hash21(uv*uRes+t)-.5)*.12*uAmt;
 c=mix(c,vec3(luma(c)),.12*uAmt);
 return vec4(c*(1.0+.05*uAmt),S(uv).a);
}` },
  { id: 'crt', name: 'CRT TV', cat: 'Glitch', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec2 c=uv-.5; float r2=dot(c,c); vec2 u=.5+c*(1.+r2*.28*uAmt);
 if(u.x<0.||u.x>1.||u.y<0.||u.y>1.) return vec4(0.,0.,0.,1.);
 vec3 col=vec3(S(u+vec2(.0015,0.)*uAmt).r,S(u).g,S(u-vec2(.0015,0.)*uAmt).b);
 float sl=.5+.5*sin(u.y*uRes.y*3.14159);
 col*=mix(1.,.72+.28*sl,uAmt);
 float mask=.85+.15*sin(u.x*uRes.x*2.1+vec3(0.,2.1,4.2)).g;
 col*=mix(1.,mask,uAmt*.5);
 col*=1.-r2*1.4*uAmt;
 col*=1.+.06*sin(uT*uP.x*40.)*uAmt;
 return vec4(col*1.08,1.);
}` },
  { id: 'noise', name: 'TV Static', cat: 'Glitch', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float n=hash21(uv*uRes+floor(uT*uP.x*30.));
 float burst=step(.94,hash(floor(uT*uP.x*3.)));
 return vec4(mix(c.rgb,vec3(n),uAmt*.45*(.35+burst)),c.a);
}` },
  { id: 'shake', name: 'Camera Shake', cat: 'Motion', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 float t=uT*uP.x*22.;
 vec2 d=(vec2(noise(vec2(t,1.))-.5,noise(vec2(t,7.))-.5))*.05*uAmt;
 vec2 u=(uv-.5)/(1.+.07*uAmt)+.5+d;
 return S(clamp(u,0.,1.));
}` },
  { id: 'pulse', name: 'Beat Zoom', cat: 'Motion', params: [INT, SPD(2)], glsl: `
vec4 effect(vec2 uv){
 float ph=fract(uT*uP.x*.5); float k=pow(1.-ph,3.);
 float z=1.+.14*uAmt*k;
 return S(clamp((uv-.5)/z+.5,0.,1.));
}` },
  { id: 'wobble', name: 'Dreamy Wobble', cat: 'Motion', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 float t=uT*uP.x;
 vec2 u=uv+vec2(sin(uv.y*7.+t*2.),cos(uv.x*7.+t*1.7))*.012*uAmt;
 return S(clamp(u,0.,1.));
}` },
  { id: 'wave', name: 'Waves', cat: 'Distort', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 float t=uT*uP.x*2.;
 vec2 u=uv+vec2(sin(uv.y*18.+t)*.03,sin(uv.x*14.+t*1.3)*.015)*uAmt;
 return S(clamp(u,0.,1.));
}` },
  { id: 'ripple', name: 'Ripple', cat: 'Distort', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec2 c=(uv-.5)*vec2(aspect(),1.); float d=length(c);
 float w=sin(d*38.-uT*uP.x*6.)*exp(-d*3.5);
 vec2 u=uv+normalize(c+1e-5)*w*.022*uAmt/vec2(aspect(),1.);
 return S(clamp(u,0.,1.));
}` },
  { id: 'fisheye', name: 'Fisheye', cat: 'Distort', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec2 c=(uv-.5)*2.; float r=length(c);
 float k=1.+uAmt*.9*(r*r);
 vec2 u=.5+c/k*.5*(1.+uAmt*.45);
 return S(clamp(u,0.,1.));
}` },
  { id: 'pinch', name: 'Pinch', cat: 'Distort', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec2 c=(uv-.5)*vec2(aspect(),1.); float r=length(c);
 float k=1.+uAmt*.9*smoothstep(.8,.0,r);
 return S(clamp(c*k/vec2(aspect(),1.)+.5,0.,1.));
}` },
  { id: 'swirl', name: 'Swirl', cat: 'Distort', params: [INT, SPD(.6)], glsl: `
vec4 effect(vec2 uv){
 vec2 c=(uv-.5)*vec2(aspect(),1.); float r=length(c);
 float a=uAmt*3.*smoothstep(.7,.0,r)*sin(uT*uP.x);
 c=rot2(a)*c;
 return S(clamp(c/vec2(aspect(),1.)+.5,0.,1.));
}` },
  { id: 'mirror', name: 'Mirror', cat: 'Distort', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec2 u=uv; if(u.x>.5) u.x=1.-u.x;
 return mix(S(uv),S(u),smoothstep(0.,.2,uAmt));
}` },
  { id: 'kaleido', name: 'Kaleidoscope', cat: 'Distort', params: [INT, SPD(.5), P('p1', 'Segments', 3, 12, 6, 1)], glsl: `
vec4 effect(vec2 uv){
 vec2 c=(uv-.5)*vec2(aspect(),1.); float a=atan(c.y,c.x)+uT*uP.x*.3; float r=length(c);
 float n=floor(uP.y+.5); float seg=2.*PI/n;
 a=abs(mod(a,seg)-seg*.5);
 vec2 u=vec2(cos(a),sin(a))*r;
 u=u/vec2(aspect(),1.)+.5;
 return mix(S(uv),S(clamp(u,0.,1.)),smoothstep(0.,.25,uAmt));
}` },
  { id: 'tile', name: 'Mosaic Tiles', cat: 'Distort', params: [INT, P('p1', 'Tiles', 2, 6, 3, 1)], glsl: `
vec4 effect(vec2 uv){
 vec2 u=fract(uv*floor(uP.y+.5));
 return mix(S(uv),S(u),smoothstep(0.,.2,uAmt));
}` },
  { id: 'pixelate', name: 'Pixelate', cat: 'Stylize', params: [INT], glsl: `
vec4 effect(vec2 uv){
 float n=mix(uRes.x,28.,pow(uAmt,.6));
 vec2 g=vec2(n,n/aspect());
 return S((floor(uv*g)+.5)/g);
}` },
  { id: 'halftone', name: 'Halftone', cat: 'Stylize', params: [INT, P('p1', 'Dots', 40, 160, 90, 1)], glsl: `
vec4 effect(vec2 uv){
 float n=uP.y; vec2 g=vec2(n,n/aspect());
 vec2 cell=floor(uv*g); vec2 f=fract(uv*g)-.5;
 vec3 c=S((cell+.5)/g).rgb; float l=luma(c);
 float rad=sqrt(l)*.62; float m=smoothstep(rad,rad-.12,length(f));
 vec3 h=c*m; return vec4(mix(S(uv).rgb,h,uAmt),1.);
}` },
  { id: 'posterize', name: 'Posterize', cat: 'Stylize', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float n=mix(32.,4.,uAmt);
 return vec4(floor(c.rgb*n+.5)/n,c.a);
}` },
  { id: 'comic', name: 'Comic Ink', cat: 'Stylize', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec2 px=1./uRes; vec4 c=S(uv);
 float tl=luma(S(uv+vec2(-px.x,-px.y)).rgb),tr=luma(S(uv+vec2(px.x,-px.y)).rgb),bl=luma(S(uv+vec2(-px.x,px.y)).rgb),br=luma(S(uv+vec2(px.x,px.y)).rgb);
 float l=luma(S(uv+vec2(-px.x,0.)).rgb),r=luma(S(uv+vec2(px.x,0.)).rgb),t=luma(S(uv+vec2(0.,-px.y)).rgb),b=luma(S(uv+vec2(0.,px.y)).rgb);
 float gx=-tl-2.*l-bl+tr+2.*r+br, gy=-tl-2.*t-tr+bl+2.*b+br;
 float e=smoothstep(.15,.45,length(vec2(gx,gy)));
 vec3 p=floor(c.rgb*5.+.5)/5.; p=mix(p,c.rgb,.25);
 vec3 o2=mix(p*1.1,vec3(0.),e);
 return vec4(mix(c.rgb,o2,uAmt),c.a);
}` },
  { id: 'neon', name: 'Neon Edges', cat: 'Stylize', params: [INT, SPD(.5)], glsl: `
vec4 effect(vec2 uv){
 vec2 px=1.5/uRes; vec4 c=S(uv);
 float tl=luma(S(uv+vec2(-px.x,-px.y)).rgb),tr=luma(S(uv+vec2(px.x,-px.y)).rgb),bl=luma(S(uv+vec2(-px.x,px.y)).rgb),br=luma(S(uv+vec2(px.x,px.y)).rgb);
 float l=luma(S(uv+vec2(-px.x,0.)).rgb),r=luma(S(uv+vec2(px.x,0.)).rgb),t=luma(S(uv+vec2(0.,-px.y)).rgb),b=luma(S(uv+vec2(0.,px.y)).rgb);
 float gx=-tl-2.*l-bl+tr+2.*r+br, gy=-tl-2.*t-tr+bl+2.*b+br;
 float e=clamp(length(vec2(gx,gy))*2.2,0.,1.);
 vec3 glow=hsv2rgb(vec3(fract(uT*uP.x*.15+uv.x*.4+uv.y*.2),.8,1.))*e;
 return vec4(c.rgb*(1.-.65*uAmt)+glow*1.6*uAmt,c.a);
}` },
  { id: 'duotone', name: 'Duotone', cat: 'Color', params: [INT, P('p1', 'Hue', 0, 1, .75, .01)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float l=luma(c.rgb);
 vec3 dark=hsv2rgb(vec3(fract(uP.y),.85,.22)); vec3 lite=hsv2rgb(vec3(fract(uP.y+.12),.55,1.));
 vec3 d=mix(dark,lite,smoothstep(.05,.95,l));
 return vec4(mix(c.rgb,d,uAmt),c.a);
}` },
  { id: 'invert', name: 'Invert', cat: 'Color', params: [INT], glsl: `
vec4 effect(vec2 uv){ vec4 c=S(uv); return vec4(mix(c.rgb,vec3(1.)-c.rgb,uAmt),c.a); }` },
  { id: 'thermal', name: 'Thermal', cat: 'Color', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float l=luma(c.rgb);
 vec3 h=hsv2rgb(vec3(clamp(.72-l*.78,0.,1.),1.,.3+l*.75));
 return vec4(mix(c.rgb,h,uAmt),c.a);
}` },
  { id: 'nightvision', name: 'Night Vision', cat: 'Color', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float l=luma(c.rgb)*1.6+hash21(uv*uRes+uT*60.)*.14;
 vec2 q=uv-.5; float v=1.-dot(q,q)*2.2;
 vec3 g=vec3(.12,1.,.28)*l*v*(.85+.15*sin(uv.y*uRes.y*1.5));
 return vec4(mix(c.rgb,g,uAmt),c.a);
}` },
  { id: 'blur', name: 'Gaussian Blur', cat: 'Blur', params: [INT], glsl: `
vec4 effect(vec2 uv){
 float rad=uAmt*.035; vec4 s=S(uv); float tot=1.;
 for(int i=0;i<24;i++){
  float fi=float(i)+1.; float a=fi*2.39996; float r=sqrt(fi/24.)*rad;
  float w=1.-fi/26.; s+=S(clamp(uv+vec2(cos(a),sin(a)*aspect())*r,0.,1.))*w; tot+=w;
 }
 return s/tot;
}` },
  { id: 'zoomblur', name: 'Zoom Blur', cat: 'Blur', params: [INT, SPD(0)], glsl: `
vec4 effect(vec2 uv){
 vec2 d=uv-.5; vec4 s=vec4(0.); float tot=0.;
 for(int i=0;i<20;i++){ float k=float(i)/19.; float w=1.-k*.6; s+=S(clamp(.5+d*(1.-k*.12*uAmt*3.),0.,1.))*w; tot+=w; }
 return s/tot;
}` },
  { id: 'motionblur', name: 'Motion Blur', cat: 'Blur', params: [INT, P('p1', 'Angle', 0, 180, 0, 1)], glsl: `
vec4 effect(vec2 uv){
 float a=radians(uP.y); vec2 dir=vec2(cos(a),sin(a)*aspect())*.03*uAmt;
 vec4 s=vec4(0.);
 for(int i=0;i<18;i++){ float k=float(i)/17.-.5; s+=S(clamp(uv+dir*k,0.,1.)); }
 return s/18.;
}` },
  { id: 'glow', name: 'Bloom Glow', cat: 'Light', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec3 acc=vec3(0.); float tot=0.;
 for(int i=0;i<24;i++){
  float fi=float(i)+1.; float a=fi*2.39996; float r=sqrt(fi/24.)*.03;
  vec3 s=S(clamp(uv+vec2(cos(a),sin(a)*aspect())*r,0.,1.)).rgb;
  float b=smoothstep(.55,1.,luma(s)); acc+=s*b; tot+=1.;
 }
 acc/=tot*.35;
 return vec4(c.rgb+acc*uAmt*1.4,c.a);
}` },
  { id: 'dreamy', name: 'Dreamy Soft', cat: 'Light', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec3 acc=vec3(0.); float tot=0.;
 for(int i=0;i<24;i++){
  float fi=float(i)+1.; float a=fi*2.39996; float r=sqrt(fi/24.)*.02;
  acc+=S(clamp(uv+vec2(cos(a),sin(a)*aspect())*r,0.,1.)).rgb; tot+=1.;
 }
 acc/=tot; vec3 soft=1.-(1.-c.rgb)*(1.-acc*.9);
 return vec4(mix(c.rgb,soft*1.03,uAmt),c.a);
}` },
  { id: 'flash', name: 'Flash Pulse', cat: 'Light', params: [INT, SPD(2)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float k=pow(max(0.,1.-fract(uT*uP.x*.5)*3.),2.);
 return vec4(c.rgb+vec3(k)*uAmt,c.a);
}` },
  { id: 'strobe', name: 'Strobe', cat: 'Light', params: [INT, SPD(4)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float k=step(.5,fract(uT*uP.x));
 return vec4(mix(c.rgb,c.rgb*.25+.0,k*uAmt),c.a);
}` },
  { id: 'lightleak', name: 'Light Leak', cat: 'Light', params: [INT, SPD(.5)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float t=uT*uP.x;
 vec2 p1=vec2(.5+.55*sin(t*.9),.35+.3*cos(t*.7)); vec2 p2=vec2(.5+.5*cos(t*.6+2.),.7+.25*sin(t*1.1));
 float g1=exp(-length((uv-p1)*vec2(1.,1.4))*3.2), g2=exp(-length((uv-p2)*vec2(1.2,1.))*3.8);
 vec3 leak=vec3(1.,.42,.12)*g1+vec3(1.,.15,.45)*g2*.8;
 vec3 res=1.-(1.-c.rgb)*(1.-leak*uAmt*1.1);
 return vec4(res,c.a);
}` },
  { id: 'sparkle', name: 'Sparkle', cat: 'Light', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec2 g=uv*vec2(aspect(),1.)*18.; vec2 id=floor(g); vec2 f=fract(g)-.5;
 float h=hash21(id); float tw=pow(max(0.,sin(uT*uP.x*3.+h*40.)),8.);
 vec2 off=(hash22(id)-.5)*.5; vec2 q=f-off;
 float star=exp(-length(q)*28.)+ (exp(-abs(q.x)*30.)*exp(-abs(q.y)*5.)+exp(-abs(q.y)*30.)*exp(-abs(q.x)*5.))*.6;
 float on=step(.7,h)*tw*star;
 return vec4(c.rgb+vec3(1.,.95,.8)*on*uAmt*1.5,c.a);
}` },
  { id: 'grain', name: 'Film Grain', cat: 'Film', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float n=hash21(uv*uRes*.6+floor(uT*uP.x*24.)*7.31)-.5;
 float l=luma(c.rgb); return vec4(c.rgb+n*uAmt*.34*(1.-.5*abs(l-.5)*2.),c.a);
}` },
  { id: 'vignette', name: 'Vignette', cat: 'Film', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec2 q=uv-.5; q.x*=mix(1.,aspect(),.4);
 float v=smoothstep(.85,.15,length(q)*1.35); return vec4(c.rgb*mix(1.,v,uAmt),c.a);
}` },
  { id: 'letterbox', name: 'Cinema Bars', cat: 'Film', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float target=2.39/aspect(); // visible height fraction
 float bar=(1.-clamp(target,0.,1.))*.5*uAmt;
 float m=step(bar,uv.y)*step(uv.y,1.-bar); return vec4(c.rgb*m,c.a);
}` },
  { id: 'filmburn', name: 'Film Burn', cat: 'Film', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float t=uT*uP.x;
 float n=fbm(uv*3.+vec2(t*.7,-t*.4)); float edge=smoothstep(.35,.9,n+uv.x*.25*sin(t));
 vec3 burn=mix(vec3(1.,.35,.05),vec3(1.,.85,.35),smoothstep(.5,1.,n))*edge;
 float flick=.75+.25*sin(t*17.);
 vec3 res=1.-(1.-c.rgb)*(1.-burn*uAmt*flick);
 res+=(hash21(uv*uRes+t)-.5)*.08*uAmt;
 return vec4(res,c.a);
}` },
  { id: 'dust', name: 'Dust & Scratches', cat: 'Film', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float f=floor(uT*uP.x*12.);
 float sc=step(.93,hash(f+floor(uv.x*60.)))*smoothstep(.0,.02,.02-abs(fract(uv.x*60.)-.5)*.04);
 vec2 g=uv*vec2(aspect(),1.)*40.; vec2 id=floor(g);
 float d=step(.985,hash21(id+f))*smoothstep(.3,.0,length(fract(g)-.5));
 float flick=1.+(hash(f)-.5)*.1*uAmt;
 return vec4(c.rgb*flick+vec3(sc*.35+d*.8)*uAmt,c.a);
}` },
  { id: 'snow', name: 'Snowfall', cat: 'Overlay', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float acc=0.;
 for(int i=0;i<3;i++){
  float fi=float(i); float sc=mix(16.,34.,fi/2.);
  vec2 p=uv*vec2(aspect(),1.)*sc; p.y+=uT*uP.x*(1.2+fi*.9); p.x+=sin(p.y*.5+fi*3.)*.4;
  vec2 id=floor(p); vec2 f=fract(p)-.5; vec2 off=(hash22(id+fi*11.)-.5)*.55;
  float r=.1+.12*hash21(id+3.); acc+=smoothstep(r,r*.3,length(f-off))*step(.35,hash21(id+fi*5.))*(1.-fi*.2);
 }
 return vec4(c.rgb+vec3(acc)*uAmt,c.a);
}` },
  { id: 'rain', name: 'Rain', cat: 'Overlay', params: [INT, SPD(1.4)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); float acc=0.;
 for(int i=0;i<3;i++){
  float fi=float(i); float cols=mix(40.,90.,fi/2.);
  vec2 p=vec2(uv.x*cols+uv.y*cols*.15,uv.y*3.5+uT*uP.x*(2.2+fi)+hash(floor(uv.x*cols)+fi*7.)*9.);
  vec2 id=floor(p); vec2 f=fract(p);
  float on=step(.7,hash21(id+fi*3.)); float streak=smoothstep(.5,.0,abs(f.x-.5))*smoothstep(.0,.5,f.y)*smoothstep(1.,.2,f.y);
  acc+=on*streak*.5;
 }
 vec3 res=c.rgb*(1.-.12*uAmt)+vec3(.75,.85,1.)*acc*uAmt*.7;
 return vec4(res,c.a);
}` },
  { id: 'bokeh', name: 'Bokeh Lights', cat: 'Overlay', params: [INT, SPD(.5)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec3 acc=vec3(0.);
 for(int i=0;i<2;i++){
  float fi=float(i); vec2 p=uv*vec2(aspect(),1.)*mix(5.,9.,fi); p.y-=uT*uP.x*(.25+fi*.15); p.x+=sin(uT*.3+fi)*.5;
  vec2 id=floor(p); vec2 f=fract(p)-.5; vec2 off=(hash22(id+fi*9.)-.5)*.6;
  float r=.18+.18*hash21(id); float d=length(f-off);
  float disc=smoothstep(r,r-.05,d)*.5+smoothstep(r,r-.015,d)*smoothstep(r-.05,r,d)*.5;
  vec3 col=hsv2rgb(vec3(.08+hash21(id+4.)*.18,.5,1.));
  acc+=col*disc*step(.45,hash21(id+fi*13.))*(.4+.6*sin(uT*uP.x*2.+hash21(id)*30.)*.5+.3);
 }
 return vec4(c.rgb+acc*uAmt*.8,c.a);
}` },
  { id: 'confetti', name: 'Confetti', cat: 'Overlay', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec3 acc=vec3(0.); float cov=0.;
 for(int i=0;i<3;i++){
  float fi=float(i); vec2 p=uv*vec2(aspect(),1.)*mix(9.,16.,fi/2.); p.y+=uT*uP.x*(.9+fi*.5); p.x+=sin(p.y*.8+fi)*.25;
  vec2 id=floor(p); vec2 f=fract(p)-.5; float h=hash21(id+fi*7.);
  vec2 q=rot2(uT*uP.x*(2.+h*5.)+h*20.)*(f-(hash22(id)-.5)*.4);
  float sq=smoothstep(.06,.03,max(abs(q.x)*1.,abs(q.y)*2.8));
  vec3 col=hsv2rgb(vec3(hash21(id+2.),.75,1.));
  float on=step(.4,hash21(id+fi*3.)); acc+=col*sq*on; cov=max(cov,sq*on);
 }
 return vec4(mix(c.rgb,acc,cov*uAmt),c.a);
}` },
  { id: 'speedlines', name: 'Speed Lines', cat: 'Overlay', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec2 q=(uv-.5)*vec2(aspect(),1.); float a=atan(q.y,q.x); float r=length(q);
 float n=hash(floor(a*70.)+floor(uT*uP.x*14.)*13.1); float ray=smoothstep(.75,1.,n);
 float mask=smoothstep(.15,.7,r);
 return vec4(mix(c.rgb,vec3(1.),ray*mask*uAmt*.8),c.a);
}` },
  { id: 'embers', name: 'Fire Embers', cat: 'Overlay', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){
 vec4 c=S(uv); vec3 acc=vec3(0.);
 for(int i=0;i<3;i++){
  float fi=float(i); vec2 p=uv*vec2(aspect(),1.)*mix(10.,22.,fi/2.); p.y-=uT*uP.x*(1.+fi*.7); p.x+=sin(p.y*1.3+fi*2.)*.35;
  vec2 id=floor(p); vec2 f=fract(p)-.5; vec2 off=(hash22(id+fi)-.5)*.5;
  float d=length(f-off); float e=exp(-d*20.)*step(.55,hash21(id+fi*9.));
  acc+=mix(vec3(1.,.3,.05),vec3(1.,.8,.3),hash21(id))*e;
 }
 return vec4(c.rgb+acc*uAmt*1.3,c.a);
}` },
  { id: 'emboss', name: 'Emboss', cat: 'Stylize', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec2 px=1.2/uRes; vec4 c=S(uv);
 vec3 e=S(uv+px).rgb-S(uv-px).rgb; float g=luma(e)*2.4+.5;
 return vec4(mix(c.rgb,vec3(g),uAmt),c.a);
}` },
  { id: 'sharpen', name: 'Sharpen Pop', cat: 'Color', params: [INT], glsl: `
vec4 effect(vec2 uv){
 vec2 px=1./uRes; vec4 c=S(uv);
 vec3 b=(S(uv+vec2(px.x,0.)).rgb+S(uv-vec2(px.x,0.)).rgb+S(uv+vec2(0.,px.y)).rgb+S(uv-vec2(0.,px.y)).rgb)*.25;
 vec3 s=c.rgb+(c.rgb-b)*uAmt*2.2; s=(s-.5)*(1.+uAmt*.12)+.5;
 return vec4(s,c.a);
}` },
  ...EXTRA_EFFECTS,
];

// ------------------------------------------------------------------ TRANSITIONS
const slide = (dir) => `const vec2 DIR=vec2(${dir});
vec4 transition(vec2 uv,float p){ vec2 u=uv-DIR*(1.-p); return in01(u)?B(u):A(uv); }`;
const push = (dir) => `const vec2 DIR=vec2(${dir});
vec4 transition(vec2 uv,float p){ vec2 u=uv-DIR*(1.-p); return in01(u)?B(u):A(uv+DIR*p); }`;
const wipe = (dir, soft = 0.03) => `const vec2 DIR=vec2(${dir});
vec4 transition(vec2 uv,float p){ float s=dot(uv-.5,DIR)+.5; float th=mix(1.+${soft},-${soft},p);
 float m=smoothstep(th-${soft},th+${soft},s); return mix(A(uv),B(uv),m); }`;

export const TRANSITIONS = [
  { id: 'fade', name: 'Crossfade', cat: 'Basic', glsl: `vec4 transition(vec2 uv,float p){ return mix(A(uv),B(uv),smoothstep(0.,1.,p)); }` },
  { id: 'fadeblack', name: 'Dip to Black', cat: 'Basic', glsl: `vec4 transition(vec2 uv,float p){ float k=abs(p*2.-1.); vec4 c=p<.5?A(uv):B(uv); return mix(vec4(0.,0.,0.,1.),c,smoothstep(0.,1.,k)); }` },
  { id: 'fadewhite', name: 'Dip to White', cat: 'Basic', glsl: `vec4 transition(vec2 uv,float p){ float k=abs(p*2.-1.); vec4 c=p<.5?A(uv):B(uv); return mix(vec4(1.),c,smoothstep(0.,1.,k)); }` },
  { id: 'dissolve', name: 'Grain Dissolve', cat: 'Basic', glsl: `vec4 transition(vec2 uv,float p){ float n=noise(uv*vec2(aspect(),1.)*14.)*.7+hash21(uv*uRes)*.3; float th=mix(-.1,1.1,p); float m=1.-smoothstep(th-.08,th+.08,n); return mix(A(uv),B(uv),m); }` },
  { id: 'luma', name: 'Diagonal Fade', cat: 'Basic', glsl: `vec4 transition(vec2 uv,float p){ float d=(uv.x+uv.y)*.5; float m=smoothstep(0.,1.,clamp((p*1.5-d)/.25,0.,1.)); return mix(A(uv),B(uv),m); }` },
  { id: 'slideleft', name: 'Slide Left', cat: 'Slide', glsl: slide('1.,0.') },
  { id: 'slideright', name: 'Slide Right', cat: 'Slide', glsl: slide('-1.,0.') },
  { id: 'slideup', name: 'Slide Up', cat: 'Slide', glsl: slide('0.,1.') },
  { id: 'slidedown', name: 'Slide Down', cat: 'Slide', glsl: slide('0.,-1.') },
  { id: 'pushleft', name: 'Push Left', cat: 'Slide', glsl: push('1.,0.') },
  { id: 'pushright', name: 'Push Right', cat: 'Slide', glsl: push('-1.,0.') },
  { id: 'pushup', name: 'Push Up', cat: 'Slide', glsl: push('0.,1.') },
  { id: 'pushdown', name: 'Push Down', cat: 'Slide', glsl: push('0.,-1.') },
  { id: 'wipeleft', name: 'Wipe Left', cat: 'Wipe', glsl: wipe('1.,0.') },
  { id: 'wiperight', name: 'Wipe Right', cat: 'Wipe', glsl: wipe('-1.,0.') },
  { id: 'wipeup', name: 'Wipe Up', cat: 'Wipe', glsl: wipe('0.,1.') },
  { id: 'wipedown', name: 'Wipe Down', cat: 'Wipe', glsl: wipe('0.,-1.') },
  { id: 'wipediag', name: 'Diagonal Wipe', cat: 'Wipe', glsl: wipe('.7071,.7071', .06) },
  { id: 'irisopen', name: 'Iris Open', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){ vec2 q=(uv-.5)*vec2(aspect(),1.); float R=p*(.5*sqrt(aspect()*aspect()+1.)+.05); float m=1.-smoothstep(R-.015,R+.015,length(q)); return mix(A(uv),B(uv),m); }` },
  { id: 'irisclose', name: 'Iris Close', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){ vec2 q=(uv-.5)*vec2(aspect(),1.); float R=(1.-p)*(.5*sqrt(aspect()*aspect()+1.)+.05); float m=smoothstep(R-.015,R+.015,length(q)); return mix(A(uv),B(uv),m); }` },
  { id: 'heart', name: 'Heart', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){
 vec2 q=(uv-.5)*vec2(aspect(),1.); float s=max(p,.0001)*(2.2+1.1*max(aspect(),1.)); q/=s; q.y=-q.y+.12;
 float x=abs(q.x)*1.05; float y=q.y*1.05; float a=x*x+y*y-1.; float v=a*a*a-x*x*y*y*y;
 float m=1.-smoothstep(-.03,.03,v); m=max(m,smoothstep(.9,1.,p)); return mix(A(uv),B(uv),m); }` },
  { id: 'clock', name: 'Clock Wipe', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){ vec2 q=uv-.5; float a=atan(q.x,-q.y)/(2.*PI)+.5; float m=smoothstep(p-.004,p+.004,a); m=1.-m; return mix(A(uv),B(uv),m); }` },
  { id: 'doors', name: 'Open Doors', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){ float d=abs(uv.x-.5)*2.; if(d<p) return B(uv); float off=sign(uv.x-.5)*p*.5; return A(clamp(vec2(uv.x-off,uv.y),0.,1.)); }` },
  { id: 'blinds', name: 'Venetian Blinds', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){ float n=10.; float f=fract(uv.y*n); float m=1.-smoothstep(p*1.05-.02,p*1.05+.02,f); return mix(A(uv),B(uv),clamp(m,0.,1.)); }` },
  { id: 'mosaic', name: 'Mosaic', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){ vec2 g=vec2(14.*aspect(),14.); vec2 id=floor(uv*g); float r=hash21(id); float m=smoothstep(r*.7,r*.7+.3,p*1.3-.0); return mix(A(uv),B(uv),clamp(m,0.,1.)); }` },
  { id: 'zoomin', name: 'Zoom In', cat: 'Zoom', glsl: `vec4 transition(vec2 uv,float p){ float s=1.+p*p*1.6; vec4 a=A(clamp((uv-.5)/s+.5,0.,1.)); vec4 b=B(clamp((uv-.5)/(.85+.15*p)+.5,0.,1.)); return mix(a,b,smoothstep(.35,.85,p)); }` },
  { id: 'zoomout', name: 'Zoom Out', cat: 'Zoom', glsl: `vec4 transition(vec2 uv,float p){ float s=1.+(1.-p)*(1.-p)*1.6; vec4 a=A(clamp((uv-.5)*(1.+p*.18)+.5,0.,1.)); vec4 b=B(clamp((uv-.5)/s+.5,0.,1.)); return mix(a,b,smoothstep(.15,.65,p)); }` },
  { id: 'crosszoom', name: 'Cross Zoom', cat: 'Zoom', glsl: `vec4 transition(vec2 uv,float p){
 float strength=.5*(1.-abs(p*2.-1.))+.02; vec2 d=uv-.5; vec4 s=vec4(0.); float tot=0.;
 for(int i=0;i<22;i++){ float k=float(i)/21.-.5; float w=1.-abs(k)*1.2; vec2 u=clamp(.5+d*(1.-k*strength*1.2),0.,1.); s+=mix(A(u),B(u),smoothstep(.3,.7,p))*w; tot+=w; }
 return s/tot; }` },
  { id: 'spin', name: 'Spin', cat: 'Zoom', glsl: `vec4 transition(vec2 uv,float p){
 vec2 q=(uv-.5)*vec2(aspect(),1.); float k=sin(p*PI); float a=k*1.4*(p<.5?1.:-1.); float s=1.+k*.5;
 vec2 u=(rot2(a)*q)/s/vec2(aspect(),1.)+.5; u=clamp(u,0.,1.);
 return mix(A(u),B(u),smoothstep(.4,.6,p)); }` },
  { id: 'swirl', name: 'Swirl', cat: 'Zoom', glsl: `vec4 transition(vec2 uv,float p){
 vec2 q=(uv-.5)*vec2(aspect(),1.); float r=length(q); float a=sin(p*PI)*5.*smoothstep(.8,.0,r); vec2 u=clamp((rot2(a)*q)/vec2(aspect(),1.)+.5,0.,1.);
 return mix(A(u),B(u),smoothstep(.35,.65,p)); }` },
  { id: 'blur', name: 'Blur Dissolve', cat: 'Blur', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI)*.03; vec4 a=vec4(0.),b=vec4(0.);
 for(int i=0;i<20;i++){ float fi=float(i)+1.; float an=fi*2.39996; float r=sqrt(fi/20.)*k; vec2 o2=vec2(cos(an),sin(an)*aspect())*r; vec2 u=clamp(uv+o2,0.,1.); a+=A(u); b+=B(u);}
 a/=20.; b/=20.; return mix(a,b,smoothstep(.25,.75,p)); }` },
  { id: 'whip', name: 'Whip Pan', cat: 'Blur', glsl: `vec4 transition(vec2 uv,float p){
 float e=p*p*(3.-2.*p); float off=e*1.0; vec4 s=vec4(0.);
 for(int i=0;i<16;i++){ float k=float(i)/15.-.5; float sh=k*.22*sin(p*PI);
   vec2 ua=vec2(uv.x+off+sh,uv.y); vec2 ub=vec2(uv.x+off-1.+sh,uv.y);
   s+=(ua.x<1.)?A(clamp(ua,0.,1.)):B(clamp(ub,0.,1.)); }
 return s/16.; }` },
  { id: 'roll', name: 'Film Roll', cat: 'Blur', glsl: `vec4 transition(vec2 uv,float p){
 float e=p*p*(3.-2.*p); vec4 s=vec4(0.);
 for(int i=0;i<14;i++){ float k=float(i)/13.-.5; float sh=k*.12*sin(p*PI); float y=uv.y+e+sh;
  s+=(y<1.)?A(vec2(uv.x,clamp(y,0.,1.))):B(vec2(uv.x,clamp(y-1.,0.,1.))); }
 return s/14.; }` },
  { id: 'glitch', name: 'Glitch', cat: 'Glitch', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI); float t=floor(p*14.); float band=floor(uv.y*mix(6.,26.,hash(t)));
 float on=step(1.-k*.8,hash(band+t*5.3)); float off=(hash(band*3.1+t)-.5)*.35*on*k;
 vec2 u=clamp(uv+vec2(off,0.),0.,1.); float sp=.03*k*on+.006*k;
 vec4 a=vec4(A(clamp(u+vec2(sp,0.),0.,1.)).r,A(u).g,A(clamp(u-vec2(sp,0.),0.,1.)).b,1.);
 vec4 b=vec4(B(clamp(u+vec2(sp,0.),0.,1.)).r,B(u).g,B(clamp(u-vec2(sp,0.),0.,1.)).b,1.);
 float sw=step(hash(band+t*2.7)*.5+.25,p); return mix(a,b,p>.5?mix(sw,1.,(p-.5)*2.):sw*step(.0,p-.25)); }` },
  { id: 'rgbwhip', name: 'RGB Shift', cat: 'Glitch', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI)*.05; float m=smoothstep(.4,.6,p);
 vec4 a=vec4(A(clamp(uv+vec2(k,0.),0.,1.)).r,A(uv).g,A(clamp(uv-vec2(k,0.),0.,1.)).b,1.);
 vec4 b=vec4(B(clamp(uv+vec2(k,0.),0.,1.)).r,B(uv).g,B(clamp(uv-vec2(k,0.),0.,1.)).b,1.);
 return mix(a,b,m); }` },
  { id: 'pixelize', name: 'Pixelize', cat: 'Glitch', glsl: `vec4 transition(vec2 uv,float p){
 float k=1.-abs(p*2.-1.); float n=mix(uRes.x,24.,k);
 vec2 g=vec2(n,n/aspect()); vec2 u=(floor(uv*g)+.5)/g; return p<.5?A(u):B(u); }` },
  { id: 'flash', name: 'Flash', cat: 'Light', glsl: `vec4 transition(vec2 uv,float p){
 float k=exp(-pow((p-.5)*5.5,2.)); vec4 c=p<.5?A(uv):B(uv); return vec4(mix(c.rgb,vec3(1.),k),1.); }` },
  { id: 'burn', name: 'Film Burn', cat: 'Light', glsl: `vec4 transition(vec2 uv,float p){
 float n=fbm(uv*2.5+p*1.3); float k=smoothstep(0.,.5,p)*smoothstep(1.,.5,p); float edge=smoothstep(.2,.9,n+k*.9-.2);
 vec3 burn=mix(vec3(1.,.3,.04),vec3(1.,.85,.4),smoothstep(.5,1.,n))*edge*k*2.2;
 vec4 c=mix(A(uv),B(uv),smoothstep(.35,.65,p)); return vec4(1.-(1.-c.rgb)*(1.-burn),1.); }` },
  { id: 'ripple', name: 'Water Ripple', cat: 'Distort', glsl: `vec4 transition(vec2 uv,float p){
 vec2 c=(uv-.5)*vec2(aspect(),1.); float d=length(c); float k=sin(p*PI);
 float w=sin(d*30.-p*14.)*.03*k; vec2 u=clamp(uv+normalize(c+1e-5)*w/vec2(aspect(),1.),0.,1.);
 return mix(A(u),B(u),smoothstep(.3,.7,p)); }` },
  { id: 'wave', name: 'Wavy', cat: 'Distort', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI); vec2 u=clamp(uv+vec2(sin(uv.y*16.+p*10.)*.05*k,0.),0.,1.);
 return mix(A(u),B(u),smoothstep(.3,.7,p)); }` },
  ...EXTRA_TRANSITIONS,
];

// ------------------------------------------------------------------ FILTERS (colour looks)
// look = {sat, con, bri, fade, sh:[r,g,b], hi:[r,g,b], tint, gam:[r,g,b], bw}
const L = (o) => ({ sat: 1, con: 1, bri: 0, fade: 0, sh: [0, 0, 0], hi: [0, 0, 0], tint: 0, gam: [1, 1, 1], bw: 0, vig: 0, grain: 0, ...o });
export const FILTERS = [
  { id: 'none', name: 'Original', cat: 'Basic', look: L({}) },
  { id: 'vivid', name: 'Vivid', cat: 'Basic', look: L({ sat: 1.35, con: 1.1, bri: 0.01 }) },
  { id: 'clean', name: 'Clean Pro', cat: 'Basic', look: L({ sat: 1.06, con: 1.04, bri: 0.01 }) },
  { id: 'bright', name: 'Bright & Airy', cat: 'Basic', look: L({ sat: 1.05, con: .92, bri: .08, fade: .05, hi: [1, .98, .95], tint: .1 }) },
  { id: 'cinema', name: 'Cinematic', cat: 'Film', look: L({ sat: .94, con: 1.14, bri: -.01, sh: [.02, .22, .28], hi: [1, .62, .32], tint: .38, gam: [1, .98, .96], vig: .22 }) },
  { id: 'tealorange', name: 'Teal & Orange', cat: 'Film', look: L({ sat: 1.12, con: 1.12, sh: [0, .35, .4], hi: [1, .55, .18], tint: .5 }) },
  { id: 'filmstock', name: 'Film Stock', cat: 'Film', look: L({ sat: .88, con: 1.06, fade: .07, sh: [.1, .16, .12], hi: [1, .88, .66], tint: .3, grain: .18, vig: .18 }) },
  { id: 'noir', name: 'Film Noir', cat: 'Mono', look: L({ bw: 1, con: 1.35, bri: -.03, vig: .35, grain: .14 }) },
  { id: 'bw', name: 'Black & White', cat: 'Mono', look: L({ bw: 1, con: 1.1 }) },
  { id: 'silver', name: 'Silver', cat: 'Mono', look: L({ bw: 1, con: .9, fade: .1, bri: .05, hi: [.85, .92, 1], tint: .25 }) },
  { id: 'sepia', name: 'Sepia', cat: 'Mono', look: L({ bw: 1, sh: [.25, .14, .05], hi: [1, .86, .6], tint: .85, con: 1.05 }) },
  { id: 'vintage', name: 'Vintage', cat: 'Retro', look: L({ sat: .8, con: .96, fade: .12, sh: [.14, .1, .06], hi: [1, .9, .7], tint: .45, vig: .3, grain: .14 }) },
  { id: 'retro70', name: 'Retro 70s', cat: 'Retro', look: L({ sat: 1.1, con: 1.05, fade: .08, sh: [.2, .08, .0], hi: [1, .78, .3], tint: .6, gam: [1, .97, .9] }) },
  { id: 'polaroid', name: 'Polaroid', cat: 'Retro', look: L({ sat: .9, con: .94, fade: .1, bri: .03, sh: [.05, .13, .12], hi: [1, .92, .8], tint: .4, vig: .25 }) },
  { id: 'warm', name: 'Warm Glow', cat: 'Tone', look: L({ sat: 1.1, bri: .02, hi: [1, .72, .38], sh: [.12, .05, 0], tint: .45 }) },
  { id: 'golden', name: 'Golden Hour', cat: 'Tone', look: L({ sat: 1.18, con: 1.05, bri: .02, hi: [1, .7, .22], sh: [.1, .04, .0], tint: .6, gam: [1, .99, .93] }) },
  { id: 'cool', name: 'Cool Blue', cat: 'Tone', look: L({ sat: 1.0, con: 1.06, sh: [0, .1, .3], hi: [.7, .85, 1], tint: .5 }) },
  { id: 'moody', name: 'Moody', cat: 'Tone', look: L({ sat: .8, con: 1.2, bri: -.05, sh: [0, .08, .12], hi: [.9, .85, .75], tint: .3, vig: .35 }) },
  { id: 'pastel', name: 'Pastel', cat: 'Soft', look: L({ sat: .85, con: .85, bri: .1, fade: .12, hi: [1, .88, .95], sh: [.2, .15, .3], tint: .35 }) },
  { id: 'matte', name: 'Matte', cat: 'Soft', look: L({ sat: .92, con: .95, fade: .16, bri: .01 }) },
  { id: 'soft', name: 'Soft Skin', cat: 'Soft', look: L({ sat: 1.02, con: .9, bri: .06, hi: [1, .9, .86], tint: .2 }) },
  { id: 'cyber', name: 'Cyberpunk', cat: 'Stylized', look: L({ sat: 1.3, con: 1.18, sh: [.28, 0, .5], hi: [.2, .9, 1], tint: .65, vig: .2 }) },
  { id: 'neonnight', name: 'Neon Night', cat: 'Stylized', look: L({ sat: 1.4, con: 1.2, bri: -.04, sh: [.35, .02, .4], hi: [1, .3, .7], tint: .5 }) },
  { id: 'forest', name: 'Forest', cat: 'Stylized', look: L({ sat: 1.1, con: 1.08, sh: [0, .16, .08], hi: [.8, 1, .55], tint: .4, gam: [.98, 1.0, .96] }) },
  { id: 'sunset', name: 'Sunset', cat: 'Stylized', look: L({ sat: 1.25, con: 1.1, sh: [.3, .06, .22], hi: [1, .52, .3], tint: .6 }) },
  { id: 'drama', name: 'Dramatic', cat: 'Stylized', look: L({ sat: 1.05, con: 1.38, bri: -.04, vig: .3 }) },
  ...EXTRA_FILTERS,
];

// ------------------------------------------------------------------ BLEND MODES
export const BLENDS = [
  { id: 'normal', name: 'Normal' }, { id: 'screen', name: 'Screen' }, { id: 'multiply', name: 'Multiply' }, { id: 'add', name: 'Add' },
  { id: 'overlay', name: 'Overlay' }, { id: 'softlight', name: 'Soft Light' }, { id: 'lighten', name: 'Lighten' }, { id: 'darken', name: 'Darken' }, { id: 'difference', name: 'Difference' },
];

export const MASKS = [
  { id: 'none', name: 'None' }, { id: 'circle', name: 'Circle' }, { id: 'rect', name: 'Rounded' }, { id: 'heart', name: 'Heart' },
  { id: 'star', name: 'Star' }, { id: 'diamond', name: 'Diamond' }, { id: 'split', name: 'Half' },
];

// ------------------------------------------------------------------ CLIP ANIMATIONS (JS transforms)
// Each returns a delta {x,y,s,r,op} (x,y in canvas fractions) given progress p 0..1 (0 = hidden, 1 = settled).
const E = (t) => 1 - (1 - t) ** 3;
export const ANIM_IN = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade', f: (p) => ({ op: p }) },
  { id: 'zoom', name: 'Zoom In', f: (p) => ({ s: 0.6 + 0.4 * E(p), op: Math.min(1, p * 2) }) },
  { id: 'pop', name: 'Pop', f: (p) => ({ s: p < 1 ? Math.max(0, E(p) * (1 + Math.sin(p * Math.PI) * 0.18)) : 1, op: Math.min(1, p * 3) }) },
  { id: 'slideup', name: 'Slide Up', f: (p) => ({ y: -0.12 * (1 - E(p)), op: p }) },
  { id: 'slidedown', name: 'Slide Down', f: (p) => ({ y: 0.12 * (1 - E(p)), op: p }) },
  { id: 'slideleft', name: 'Slide Left', f: (p) => ({ x: 0.25 * (1 - E(p)), op: p }) },
  { id: 'slideright', name: 'Slide Right', f: (p) => ({ x: -0.25 * (1 - E(p)), op: p }) },
  { id: 'spin', name: 'Spin', f: (p) => ({ r: -180 * (1 - E(p)), s: 0.3 + 0.7 * E(p), op: Math.min(1, p * 3) }) },
  { id: 'bounce', name: 'Bounce', f: (p) => ({ y: p < 1 ? -0.16 * Math.abs(Math.cos(p * Math.PI * 2.5)) * (1 - p) : 0, op: Math.min(1, p * 4) }) },
  { id: 'swing', name: 'Swing', f: (p) => ({ r: 40 * (1 - E(p)) * Math.cos(p * 9), op: Math.min(1, p * 3) }) },
  { id: 'type', name: 'Typewriter', f: (p) => ({ type: p }), textOnly: true },
  { id: 'words', name: 'Word by Word', f: (p) => ({ words: p }), textOnly: true },
];
export const ANIM_OUT = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade', f: (p) => ({ op: 1 - p }) },
  { id: 'zoom', name: 'Zoom Out', f: (p) => ({ s: 1 - 0.4 * p, op: 1 - p }) },
  { id: 'zoomin', name: 'Zoom In', f: (p) => ({ s: 1 + 0.5 * p, op: 1 - p }) },
  { id: 'slideup', name: 'Slide Up', f: (p) => ({ y: -0.12 * p, op: 1 - p }) },
  { id: 'slidedown', name: 'Slide Down', f: (p) => ({ y: 0.12 * p, op: 1 - p }) },
  { id: 'slideleft', name: 'Slide Left', f: (p) => ({ x: 0.25 * p, op: 1 - p }) },
  { id: 'slideright', name: 'Slide Right', f: (p) => ({ x: -0.25 * p, op: 1 - p }) },
  { id: 'spin', name: 'Spin', f: (p) => ({ r: 180 * p, s: 1 - 0.7 * p, op: 1 - p }) },
  { id: 'shrink', name: 'Shrink', f: (p) => ({ s: 1 - p, op: 1 - p * p }) },
];
export const ANIM_LOOP = [
  { id: 'none', name: 'None' },
  { id: 'pulse', name: 'Pulse', f: (t, k) => ({ s: 1 + 0.06 * k * Math.sin(t * 6) }) },
  { id: 'float', name: 'Float', f: (t, k) => ({ y: 0.012 * k * Math.sin(t * 2.4) }) },
  { id: 'wiggle', name: 'Wiggle', f: (t, k) => ({ r: 4 * k * Math.sin(t * 9) }) },
  { id: 'heartbeat', name: 'Heartbeat', f: (t, k) => ({ s: 1 + 0.09 * k * Math.max(0, Math.sin(t * 7)) ** 3 }) },
  { id: 'spin', name: 'Spin', f: (t, k) => ({ r: ((t * 60 * k) % 360) }) },
  { id: 'shake', name: 'Shake', f: (t, k) => ({ x: 0.006 * k * Math.sin(t * 40), y: 0.004 * k * Math.cos(t * 33) }) },
];

export const effectById = (id) => EFFECTS.find((e) => e.id === id);
export const transitionById = (id) => TRANSITIONS.find((e) => e.id === id);
export const filterById = (id) => FILTERS.find((e) => e.id === id) || FILTERS[0];
export const effectDefaults = (id) => {
  const e = effectById(id); const o = { type: id };
  e?.params.forEach((p) => { o[p.k] = p.def; });
  return o;
};
