// Built-in animated B-roll. Each generator is a GLSL function rendered in real time at any resolution,
// so the clips are tiny, royalty-free, loop-friendly and sharp on every canvas size.
import { GLSL_COMMON } from './effects.js';
import { EXTRA_GENERATORS } from './generators-extra.js';
import { REAL_GENERATORS } from './generators-real.js';

export const GENRES = [
  { id: 'nature', name: 'Nature' }, { id: 'city', name: 'City & Night' }, { id: 'tech', name: 'Tech & Business' },
  { id: 'space', name: 'Space' }, { id: 'lifestyle', name: 'Lifestyle & Beauty' }, { id: 'food', name: 'Food & Cozy' },
  { id: 'music', name: 'Music & Party' }, { id: 'gaming', name: 'Gaming & Retro' }, { id: 'fitness', name: 'Fitness & Energy' },
  { id: 'cinema', name: 'Cinematic' }, { id: 'edu', name: 'Education' }, { id: 'travel', name: 'Travel' },
  { id: 'romance', name: 'Romance' }, { id: 'dark', name: 'Dark & Horror' }, { id: 'fun', name: 'Fun & Holiday' }, { id: 'finance', name: 'Money & Finance' },
];

export const genFragment = (body) => `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uT; in vec2 vUv; out vec4 o;
${GLSL_COMMON}
float star(vec2 p,float t,float dens){
 vec2 g=p*dens; vec2 id=floor(g); vec2 f=fract(g)-.5; float h=hash21(id); vec2 off=(hash22(id+3.1)-.5)*.7;
 float d=length(f-off); float tw=.55+.45*sin(t*(1.+h*3.)+h*40.);
 return step(.8,h)*smoothstep(.09*(.4+h),.0,d)*tw; }
float bokeh(vec2 p,float t,float sc,float spd,float seed,out vec3 colr){
 vec2 q=p*sc; q.y-=t*spd; vec2 id=floor(q); vec2 f=fract(q)-.5; vec2 off=(hash22(id+seed)-.5)*.5;
 float r=.14+.2*hash21(id+seed+1.7); float d=length(f-off);
 float disc=smoothstep(r,r-.04,d)*.45+smoothstep(r,r-.012,d)*smoothstep(r-.05,r,d)*.5;
 colr=hsv2rgb(vec3(hash21(id+seed+4.2),.55,1.)); return disc*step(.35,hash21(id+seed+9.1))*(.55+.45*sin(t*1.3+hash21(id)*30.)); }
vec3 skyGrad(float y,vec3 a,vec3 b,vec3 c){ return y<.5?mix(a,b,y*2.):mix(b,c,y*2.-1.); }
float ridge(float x,float seed,float amp,float t,float spd){ x+=t*spd; return amp*(fbm(vec2(x*1.6+seed,seed))*1.3+.25*sin(x*2.1+seed)); }
${body}
void main(){ vec2 uv=vUv; vec2 p=(uv-.5)*vec2(uRes.x/uRes.y,1.); o=vec4(clamp(gen(uv,p,uT),0.,1.),1.); }`;

const G = (id, name, genre, glsl) => ({ id, name, genre, glsl });

export const GENERATORS = [
  // ------------------------------------------------------------ NATURE
  G('aurora', 'Aurora Sky', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.01,.02,.05),vec3(.015,.05,.12),uv.y);
 col+=vec3(star(p+vec2(10.),t,46.))*smoothstep(.3,.7,uv.y);
 for(int i=0;i<3;i++){ float fi=float(i);
  float y=.5+fi*.08+.07*sin(p.x*3.+t*.4+fi*2.)+.07*fbm(vec2(p.x*2.+fi*5.,t*.12));
  float d=uv.y-y; float band=d<0.?exp(-pow(d*16.,2.)):exp(-d*5.);
  float rays=.5+.5*noise(vec2(p.x*26.+fi*7.,t*.6));
  vec3 c=mix(vec3(.1,1.,.55),vec3(.65,.25,1.),fi*.4+.12*sin(t*.3+p.x*2.));
  col+=c*band*rays*.6; }
 return col; }`),
  G('ocean', 'Golden Ocean', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 float hz=.5; vec3 sky=mix(vec3(1.,.62,.32),vec3(.22,.28,.55),smoothstep(hz,1.,uv.y));
 float sun=exp(-length(vec2(p.x,uv.y-hz-.03))*7.); sky+=vec3(1.,.8,.5)*sun*.9; vec3 col=sky;
 if(uv.y<hz){ float z=1./(hz-uv.y+.02); float w=sin(z*3.-t*1.4+p.x*z*.6)*.5+.5; w=w*.6+.4*noise(vec2(p.x*z*2.,z*4.-t*1.5));
  vec3 sea=mix(vec3(.02,.09,.18),vec3(.06,.24,.34),w); sea=mix(sea,vec3(1.,.55,.28),exp(-abs(p.x)*z*1.4)*.4*w);
  float glit=pow(noise(vec2(p.x*z*6.,z*9.-t*3.)),4.)*exp(-abs(p.x)*z*1.0)*1.5*exp(-(hz-uv.y)*1.6); sea+=vec3(1.,.8,.55)*glit;
  col=mix(sea,sky,exp(-(hz-uv.y)*14.)*.7); }
 return col; }`),
  G('rainglass', 'Rainy Night Bokeh', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 bg=vec3(.03,.04,.09); vec3 bk; float acc=0.;
 vec3 col=bg;
 for(int i=0;i<3;i++){ float b=bokeh(p+vec2(sin(t*.1+float(i)),0.),t*.4,5.+float(i)*3.,.05,float(i)*13.,bk); col+=bk*b*.5; }
 float drops=0.; vec2 q=p*vec2(7.,4.); q.y+=t*.35*hash21(floor(q*vec2(1.,0.)))*0.; vec2 id=floor(q);
 for(int j=0;j<2;j++){ vec2 g=p*vec2(9.,5.)*(1.+float(j)*.8); g.y+=t*(.15+hash(floor(g.x))*.4); vec2 i2=floor(g); vec2 f=fract(g)-.5; vec2 off=(hash22(i2+float(j))-.5)*.5; float d=length((f-off)*vec2(1.,.75));
  float r=.1+.1*hash21(i2+3.); float drop=smoothstep(r,r-.03,d); drops+=drop*step(.55,hash21(i2+float(j)*5.)); }
 col=mix(col,col*1.8+vec3(.08,.1,.14),clamp(drops,0.,1.));
 col+=vec3(.55,.7,1.)*pow(noise(p*60.+t*.2),6.)*.06;
 return col; }`),
  G('forestrays', 'Forest Light Rays', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.02,.09,.06),vec3(.25,.5,.28),uv.y*.9);
 float ang=(p.x+.25)/(1.1-uv.y*.5);
 float rays=0.; for(int i=0;i<3;i++){ float fi=float(i); rays+=pow(noise(vec2(ang*(6.+fi*5.)+fi*3.,t*.15*(1.+fi*.3))),2.5)*(.7-fi*.15); }
 rays*=smoothstep(.0,.9,uv.y); col+=vec3(1.,.95,.6)*rays*.38;
 col+=vec3(1.,.95,.7)*pow(max(0.,hash21(floor(p*vec2(90.,60.)+t*vec2(.5,-1.)))-.985),1.)*14.*smoothstep(.3,.8,rays);
 col*=1.-.4*length(p*vec2(.9,1.));
 return col; }`),
  G('goldenclouds', 'Golden Clouds', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 sky=skyGrad(uv.y,vec3(1.,.55,.28),vec3(.95,.45,.5),vec3(.2,.25,.55));
 float sun=exp(-length(p-vec2(.0,-.25))*4.); sky+=vec3(1.,.8,.5)*sun*.8;
 float c=fbm(vec2(p.x*2.2+t*.06,p.y*5.+2.))*1.3; c=smoothstep(.45,.85,c+ (uv.y-.5)*.25);
 vec3 cc=mix(vec3(.35,.2,.35),vec3(1.,.82,.6),smoothstep(.3,.9,uv.y*.5+fbm(p*3.+t*.05)*.8));
 return mix(sky,cc,c*.85); }`),
  G('snownight', 'Snowfall Night', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.02,.04,.1),vec3(.1,.18,.32),uv.y);
 col+=vec3(star(p,t,50.))*smoothstep(.5,.9,uv.y)*.8;
 for(int i=0;i<4;i++){ float fi=float(i); float sc=10.+fi*10.; vec2 q=p*sc; q.y+=t*(.8+fi*.7); q.x+=sin(q.y*.4+fi*3.)*.5;
  vec2 id=floor(q); vec2 f=fract(q)-.5; vec2 off=(hash22(id+fi*7.)-.5)*.6; float r=.07+.06*hash21(id);
  col+=vec3(smoothstep(r,r*.2,length(f-off)))*step(.4,hash21(id+fi*3.))*(1.-fi*.15); }
 return col; }`),
  G('fireflies', 'Fireflies', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.01,.03,.03),vec3(.03,.08,.09),uv.y);
 col+=vec3(.0,.03,.02)*(ridge(p.x,3.,.35,t,.0)>uv.y-.1?1.:0.);
 col*=1.-.7*step(uv.y,.18+ridge(p.x*2.,7.,.12,t,.01));
 for(int i=0;i<3;i++){ float fi=float(i); vec2 q=p*(6.+fi*5.); q+=vec2(sin(t*.3+fi),cos(t*.4+fi*2.))*.8; q.y-=t*.15;
  vec2 id=floor(q); vec2 f=fract(q)-.5; vec2 off=(hash22(id+fi*3.)-.5)*.6+vec2(sin(t*.8+hash21(id)*30.),cos(t*.7+hash21(id)*20.))*.15;
  float d=length(f-off); float b=pow(.5+.5*sin(t*1.5+hash21(id+1.)*40.),3.);
  col+=vec3(1.,.9,.35)*exp(-d*22.)*b*step(.45,hash21(id+fi))*1.2; }
 return col; }`),

  // ------------------------------------------------------------ CITY
  G('neoncity', 'Neon City', 'city', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=skyGrad(uv.y,vec3(.9,.2,.55),vec3(.35,.1,.5),vec3(.03,.03,.14));
 col+=vec3(star(p,t,40.))*smoothstep(.55,.9,uv.y);
 for(int i=0;i<3;i++){ float fi=float(i); float sc=7.+fi*6.; float x=p.x*sc+t*(.15+fi*.2);
  float id=floor(x); float h=.18+.38*hash(id+fi*17.)-fi*.06; float w=step(fract(x),.88);
  float inside=step(uv.y,h)*w; vec3 bcol=mix(vec3(.08,.04,.18),vec3(.02,.02,.08),fi*.4);
  vec2 wg=vec2(fract(x)*7.,uv.y*sc*3.2); vec2 wid=floor(wg); float lit=step(.62,hash21(wid+id*3.1))*step(.2,fract(wg.x))*step(.2,fract(wg.y))*step(fract(wg.x),.75)*step(fract(wg.y),.75);
  vec3 wc=mix(vec3(1.,.8,.4),vec3(.3,.9,1.),hash21(wid+id));
  col=mix(col,bcol+wc*lit*(.6+.4*sin(t+hash21(wid)*20.)),inside); }
 vec3 bk; for(int k=0;k<2;k++){ float b=bokeh(p,t,4.+float(k)*3.,.1,float(k)*5.,bk); col+=bk*b*.28; }
 return col; }`),
  G('lighttrails', 'Highway Trails', 'city', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.02,.02,.06),vec3(.08,.04,.16),uv.y);
 vec2 q=p-vec2(0.,.05); float r=length(q); float a=atan(q.y,q.x);
 float lanes=0.; for(int i=0;i<3;i++){ float fi=float(i); float n=60.+fi*50.; float id=floor(a*n/6.28318); float h=hash(id+fi*31.);
  float speed=.5+h*1.5; float z=fract(1./(r+.02)*.05-t*speed*.25+h*9.); float tail=smoothstep(.0,.35,z)*smoothstep(1.,.5,z);
  float ang=abs(fract(a*n/6.28318)-.5); float w=smoothstep(.2,.0,ang)*tail*step(.45,hash(id*3.1+fi)); vec3 c=mix(vec3(1.,.15,.2),vec3(.2,.7,1.),step(.5,hash(id*7.+fi))); col+=c*w*(.4+r*3.)*.7; }
 col+=vec3(.9,.4,.8)*exp(-r*5.)*.4;
 return col; }`),
  G('warptunnel', 'Neon Tunnel', 'city', `
vec3 gen(vec2 uv,vec2 p,float t){
 float r=length(p); float a=atan(p.y,p.x); float z=1./(r+.05);
 float rings=smoothstep(.06,.0,abs(fract(z*.6-t*.6)-.5)-.44); float ribs=smoothstep(.05,.0,abs(fract(a*5./3.14159+z*.1+t*.1)-.5)-.47);
 vec3 c=hsv2rgb(vec3(fract(.62+z*.02+t*.03),.8,1.));
 vec3 col=vec3(.02,.02,.08)+c*(rings*.9+ribs*.5)*smoothstep(.0,.35,r)*1.1;
 col+=c*exp(-r*5.)*.35; return col; }`),

  // ------------------------------------------------------------ TECH & BUSINESS
  G('matrix', 'Digital Rain', 'tech', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 g=vec2(p.x*34.,uv.y*58.); float col_id=floor(g.x); float spd=.4+hash(col_id)*1.2;
 float y=g.y+t*spd*14.*sign(1.)+hash(col_id*3.)*50.; float row=floor(y); float head=fract(y/38.);
 float ch=step(.4,hash21(vec2(col_id,row)+floor(t*spd*6.)*.0));
 vec2 f=fract(vec2(g.x,y)); float glyph=ch*step(.15,f.x)*step(f.x,.85)*step(.12,f.y)*step(f.y,.88)*step(.3,hash21(floor(f*vec2(3.,5.))+vec2(col_id,row)));
 float fade=pow(1.-head,2.5); vec3 c=mix(vec3(.0,.6,.3),vec3(.7,1.,.85),step(.97,head));
 return vec3(.0,.03,.02)+c*glyph*fade*1.3; }`),
  G('circuit', 'Circuit Pulse', 'tech', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 g=p*10.; vec2 id=floor(g); vec2 f=fract(g)-.5; float h=hash21(id); vec3 col=vec3(.01,.04,.09);
 float hor=step(.5,h); float line=mix(smoothstep(.05,.0,abs(f.y)),smoothstep(.05,.0,abs(f.x)),hor);
 float node=smoothstep(.12,.08,length(f))*step(.7,hash21(id+5.));
 float pulse=pow(.5+.5*sin(t*2.-dot(id,vec2(1.,.7))*.9+h*6.),12.);
 col+=vec3(.0,.35,.55)*line*.7+vec3(.1,.9,1.)*line*pulse*1.2+vec3(.2,.8,1.)*node*.9;
 col+=vec3(.0,.1,.2)*exp(-length(p)*1.5)*.8; return col; }`),
  G('network', 'Data Network', 'tech', `
vec2 np(float i,float t){ return vec2(sin(t*.3+i*1.7)*.7+cos(t*.2+i*2.9)*.3,cos(t*.27+i*2.3)*.7+sin(t*.35+i*4.1)*.3); }
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.02,.05,.12),vec3(.03,.1,.2),uv.y); float aspm=uRes.x/uRes.y; float thr=.34+.16*aspm;
 vec2 pts[14]; for(int i=0;i<14;i++){ vec2 n=np(float(i),t); pts[i]=vec2(n.x*aspm*.46,n.y*.46); }
 for(int i=0;i<14;i++){ float d=length(p-pts[i]); col+=vec3(.35,.85,1.)*exp(-d*70.)*1.5+vec3(.1,.4,.8)*exp(-d*16.)*.3;
  for(int j=i+1;j<14;j++){ vec2 a=pts[i],b=pts[j]; vec2 ab=b-a; float len=length(ab); if(len<thr){ float h=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.); float dl=length(p-a-ab*h); col+=vec3(.25,.7,1.)*smoothstep(.0035,.0,dl)*(1.-len/thr)*.9; } } }
 return col; }`),
  G('holofloor', 'Hologram Grid', 'tech', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.01,.02,.06),vec3(.04,.1,.22),uv.y); float hz=.45;
 if(uv.y<hz){ float z=1./(hz-uv.y+.015); vec2 g=vec2(p.x*z*2.,z*3.-t*1.2); vec2 f=abs(fract(g)-.5); float l=smoothstep(.04,.0,min(.5-f.x,.5-f.y)+.0)*0.+smoothstep(.06,.0,.5-max(f.x,f.y)+.0)*0.;
  float gl=smoothstep(.04*z*.3+.02,.0,min(abs(fract(g.x)-.5),1.)*0.+0.5-abs(fract(g.x)-.5)) ; float gr=smoothstep(.05,.0,.5-abs(fract(g.y)-.5));
  float lines=max(smoothstep(.03,.0,.5-abs(fract(g.x)-.5)),gr); col+=vec3(.1,.7,1.)*lines*exp(-(hz-uv.y)*2.2)*1.1; }
 col+=vec3(.2,.6,1.)*exp(-abs(uv.y-hz)*28.)*.8;
 float sweep=fract(t*.18); col+=vec3(.2,.8,1.)*exp(-abs(uv.y-(.2+sweep*.8))*40.)*.12;
 return col; }`),
  G('corpwaves', 'Corporate Waves', 'tech', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.03,.1,.28),vec3(.05,.35,.5),uv.y);
 for(int i=0;i<4;i++){ float fi=float(i); float y=.28+fi*.14+.06*sin(p.x*3.+t*.5+fi*1.6)+.03*sin(p.x*7.-t*.7+fi);
  float m=smoothstep(y+.004,y-.004,uv.y); vec3 c=mix(vec3(.06,.4,.7),vec3(.25,.85,.85),fi/3.); col=mix(col,c,m*.32); col+=vec3(1.)*smoothstep(.006,.0,abs(uv.y-y))*.18; }
 col+=vec3(.2,.5,1.)*exp(-length(p-vec2(.3,.3))*3.)*.25; return col; }`),
  G('barchart', 'Growth Bars', 'tech', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.04,.06,.14),vec3(.07,.1,.22),uv.y); float n=12.; float x=uv.x*n; float id=floor(x); float f=fract(x);
 float h=.12+.62*smoothstep(0.,1.,id/n)*(.75+.25*sin(t*.8+id*1.3))+.06*sin(t+id); h=min(h,.82);
 float bar=step(.14,f)*step(f,.86)*step(uv.y,h+.08)*step(.08,uv.y);
 vec3 c=mix(vec3(.1,.6,1.),vec3(.2,1.,.7),id/n); col=mix(col,c*(.5+.5*uv.y/ (h+.08)),bar); col+=c*smoothstep(.03,.0,abs(uv.y-(h+.08)))*bar*.8;
 col+=vec3(1.)*smoothstep(.003,.0,abs(fract(uv.y*8.)-.5)-.497)*.06; return col; }`),

  // ------------------------------------------------------------ SPACE
  G('warp', 'Hyperspace Warp', 'space', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.005,.01,.04); float r=length(p); float a=atan(p.y,p.x);
 for(int i=0;i<3;i++){ float fi=float(i); float n=120.+fi*70.; float id=floor(a*n/6.28318); float h=hash(id+fi*13.);
  float z=fract(h*7.+t*(.25+h*.5)); float rr=z*z*1.2; float len=.03+z*.22; float ang=abs(fract(a*n/6.28318)-.5);
  float on=smoothstep(rr,rr-.004,r)*smoothstep(rr-len,rr,r)*smoothstep(.22,.0,ang)*step(.35,hash(id*3.7+fi)); col+=mix(vec3(.6,.8,1.),vec3(1.),h)*on*z*1.6; }
 col+=vec3(.2,.35,1.)*exp(-r*4.)*.18; return col; }`),
  G('nebula', 'Nebula Drift', 'space', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*1.6+vec2(t*.02,0.); float n1=fbm(q+fbm(q*1.5+t*.03)*1.4); float n2=fbm(q*2.+5.+vec2(0.,t*.025));
 vec3 col=vec3(.01,.01,.04); col+=vec3(.6,.1,.55)*smoothstep(.35,.85,n1)*.9+vec3(.1,.3,.9)*smoothstep(.4,.9,n2)*.8+vec3(1.,.5,.3)*pow(n1*n2,3.)*3.;
 col+=vec3(star(p,t,70.))+vec3(star(p+7.,t,35.))*.8; return col; }`),
  G('planet', 'Planet Horizon', 'space', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.005,.01,.03)+vec3(star(p,t,60.))*.9+vec3(star(p+3.,t,30.))*.6; vec2 c=vec2(0.,-1.2); float r=length(p-c); float R=1.0;
 vec2 d=p-c; float edge=smoothstep(R,R-.004,r);
 float bands=fbm(vec2(d.x*2.+t*.02,d.y*9.))*.8+fbm(d*5.+t*.03)*.4; vec3 surf=mix(vec3(.04,.14,.32),vec3(.35,.7,.95),bands);
 float lit=smoothstep(-.35,.5,dot(normalize(d),normalize(vec2(.6,.5)))); surf*=.18+1.25*lit;
 col=mix(col,surf,edge);
 float atm=exp(-max(r-R,0.)*22.); col+=vec3(.25,.6,1.)*atm*(.35+.9*lit)*step(R,r)*.9;
 col+=vec3(.4,.7,1.)*exp(-abs(r-R)*160.)*.9*(.3+lit);
 return col; }`),
  // ------------------------------------------------------------ LIFESTYLE
  G('liquidpastel', 'Liquid Pastel', 'lifestyle', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*1.3; q+=vec2(fbm(q+t*.07),fbm(q+4.+t*.06))*1.1; float n=fbm(q*1.2+t*.05);
 vec3 a=vec3(1.,.78,.86),b=vec3(.74,.8,1.),c=vec3(1.,.9,.72),d=vec3(.78,1.,.9);
 vec3 col=mix(a,b,smoothstep(.2,.6,n)); col=mix(col,c,smoothstep(.5,.8,fbm(q*1.7+9.)))*1.0; col=mix(col,d,smoothstep(.55,.85,fbm(q*.9-3.))*.6);
 return col; }`),
  G('silk', 'Rose Gold Silk', 'lifestyle', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*1.8; float a=q.x*3.+sin(q.y*2.+t*.35)*1.3+t*.25; float b=q.y*3.7-q.x*1.4+t*.3;
 vec3 n=normalize(vec3(-cos(a)*.5*1.2,-cos(b)*.3*1.1,1.));
 vec3 L=normalize(vec3(-.4,.5,.8)); float diff=clamp(dot(n,L),0.,1.); vec3 H=normalize(L+vec3(0.,0.,1.)); float spec=pow(clamp(dot(n,H),0.,1.),40.);
 vec3 base=vec3(.82,.46,.48); return base*(.18+.85*diff)+vec3(1.,.86,.8)*spec*.5; }`),
  G('marble', 'Gold Marble Ink', 'lifestyle', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*1.8; q+=vec2(fbm(q*1.2+t*.04),fbm(q*1.2+7.-t*.05))*1.5; float n=fbm(q*1.5);
 float vein=smoothstep(.03,.0,abs(n-.5)-.0)*.0+pow(1.-abs(sin(n*14.)),6.); vec3 col=mix(vec3(.04,.04,.06),vec3(.14,.14,.18),n);
 col+=vec3(1.,.75,.35)*vein*.8; return col; }`),
  G('dreambokeh', 'Dreamy Bokeh', 'lifestyle', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.28,.12,.3),vec3(.1,.18,.4),uv.y); vec3 bk;
 for(int i=0;i<4;i++){ float b=bokeh(p+vec2(sin(t*.08+float(i)*2.),0.),t,3.2+float(i)*2.,.1+float(i)*.03,float(i)*11.,bk); col+=bk*b*.55; }
 return col; }`),

  // ------------------------------------------------------------ FOOD & COZY
  G('cafeglow', 'Café Glow', 'food', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.12,.05,.02),vec3(.28,.13,.05),uv.y); vec3 bk;
 for(int i=0;i<4;i++){ float b=bokeh(p,t,3.+float(i)*2.4,.04+float(i)*.02,float(i)*7.,bk); col+=mix(vec3(1.,.6,.2),bk,.25)*b*.5*(.85+.15*sin(t*7.+float(i))); }
 col*=1.-.35*length(p); return col; }`),
  G('steam', 'Rising Steam', 'food', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.08,.04,.03),vec3(.2,.11,.06),uv.y); float s=0.;
 for(int i=0;i<3;i++){ float fi=float(i); vec2 q=vec2(p.x*(2.+fi)+sin(uv.y*(3.+fi)-t*(.5+fi*.2)+fi*2.)*.4+fi*1.3,uv.y*1.4-t*(.12+fi*.05)); float n=fbm(q*2.2); s+=smoothstep(.38,.8,n)*(.55-fi*.1); }
 s*=smoothstep(.0,.2,uv.y)*smoothstep(1.,.55,uv.y); col+=vec3(1.,.92,.82)*s*.5+vec3(1.,.5,.15)*exp(-length(p-vec2(0.,-.5))*3.)*.22; return col; }`),
  // ------------------------------------------------------------ MUSIC & PARTY
  G('spectrum', 'Audio Spectrum', 'music', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.04,.02,.1),vec3(.1,.04,.18),uv.y); float n=32.; float x=uv.x*n; float id=floor(x); float f=fract(x);
 float h=.08+.55*(.5+.5*sin(t*3.+id*.7))*(.4+.6*noise(vec2(id*.4,t*1.6)))+.1*sin(t*5.+id*2.3); float seg=floor(uv.y*38.);
 float on=step(seg/38.,h)*step(.12,f)*step(f,.88)*step(.12,fract(uv.y*38.))*step(fract(uv.y*38.),.88);
 vec3 c=hsv2rgb(vec3(fract(.9-uv.y*.4+id*.01+t*.02),.8,1.)); col+=c*on*1.2; col+=c*.06*exp(-abs(uv.y-h)*4.); return col; }`),
  G('lasers', 'Laser Show', 'music', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.01,.01,.04); vec2 o=vec2(0.,-.55); vec2 d=p-o; float a=atan(d.x,d.y);
 for(int i=0;i<9;i++){ float fi=float(i); float ang=sin(t*.7+fi*.9)*.9+(fi-4.)*.14; float w=abs(a-ang); vec3 c=hsv2rgb(vec3(fract(fi*.11+t*.05),.9,1.)); col+=c*(exp(-w*70.)*.9+exp(-w*8.)*.08)*smoothstep(.0,.2,d.y+.2); }
 col+=vec3(.3,.1,.5)*fbm(p*3.+t*.1)*.15; return col; }`),
  G('disco', 'Disco Lights', 'music', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.03,.01,.06); vec2 q=rot2(t*.15)*p*8.; vec2 id=floor(q); vec2 f=fract(q);
 float h=hash21(id); float on=smoothstep(.5,.9,.5+.5*sin(t*(1.+h*3.)+h*30.)); vec3 c=hsv2rgb(vec3(fract(h+t*.03),.8,1.));
 col+=c*on*smoothstep(.5,.15,length(f-.5))*.55; col+=vec3(.5,.2,.8)*exp(-length(p)*2.)*.2; return col; }`),
  G('pulserings', 'Pulse Rings', 'music', `
vec3 gen(vec2 uv,vec2 p,float t){
 float r=length(p); vec3 col=vec3(.02,.01,.06); for(int i=0;i<6;i++){ float fi=float(i); float rr=fract(t*.35+fi/6.); float rad=rr*.95; float w=smoothstep(.02+rr*.03,.0,abs(r-rad));
  col+=hsv2rgb(vec3(fract(.85+fi*.08+t*.05),.75,1.))*w*(1.-rr)*1.3; } col+=vec3(1.,.4,.8)*exp(-r*7.)*.5*(.7+.3*sin(t*8.)); return col; }`),

  // ------------------------------------------------------------ GAMING & RETRO
  G('synthwave', 'Synthwave Sun', 'gaming', `
vec3 gen(vec2 uv,vec2 p,float t){
 float hz=.42; vec3 col=skyGrad(uv.y,vec3(1.,.3,.5),vec3(.45,.1,.55),vec3(.03,.0,.12));
 vec2 sc=vec2(p.x,uv.y-.55); float sr=length(sc); float sun=smoothstep(.27,.265,sr); float stripe=step(.5,fract((uv.y-.3)*14.-t*.0))*step(uv.y,.52)+step(.52,uv.y);
 float cut=1.-smoothstep(.0,.3,.55-uv.y)*step(.5,fract(uv.y*22.+t*.4)); vec3 sunc=mix(vec3(1.,.9,.2),vec3(1.,.15,.5),smoothstep(.65,.3,uv.y)); col=mix(col,sunc,sun*cut);
 col+=vec3(1.,.3,.6)*exp(-sr*4.)*.25*step(hz,uv.y);
 if(uv.y<hz){ float z=1./(hz-uv.y+.01); vec2 g=vec2(p.x*z*1.2,z*1.6+t*1.4); vec2 f=abs(fract(g)-.5); float l=max(smoothstep(.07,.0,.5-f.x)*1.,smoothstep(.07,.0,.5-f.y)); col=vec3(.04,.0,.12)+vec3(.9,.2,1.)*l*exp(-(hz-uv.y)*2.2); }
 col+=vec3(1.,.3,.7)*exp(-abs(uv.y-hz)*40.)*.8; return col; }`),
  G('pixelrain', 'Pixel Rain', 'gaming', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 g=vec2(uv.x*36.*uRes.x/uRes.y,uv.y*36.); vec2 id=floor(g); float spd=.5+hash(id.x)*1.6; float y=floor(g.y+t*spd*7.+hash(id.x*5.)*40.);
 float on=step(.6,hash21(vec2(id.x,y))); float head=fract((g.y+t*spd*7.+hash(id.x*5.)*40.)/14.); vec3 c=hsv2rgb(vec3(fract(.55+hash(id.x)*.35),.8,1.));
 vec3 col=vec3(.02,.02,.06)+c*on*pow(1.-head,2.)*step(.08,fract(g.x))*step(.08,fract(g.y))*1.1; return col; }`),
  G('colorbars', 'Retro TV Bars', 'gaming', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 u=uv; u.x+=(hash(floor(u.y*60.)+floor(t*8.))-.5)*.01*step(.9,hash(floor(t*3.)));
 float b=floor(u.x*7.); vec3 c=b<1.?vec3(.95):b<2.?vec3(.95,.95,0.):b<3.?vec3(0.,.95,.95):b<4.?vec3(0.,.95,0.):b<5.?vec3(.95,0.,.95):b<6.?vec3(.95,0.,0.):vec3(0.,0.,.95);
 if(u.y<.25){ float k=floor(u.x*7.); c=k<1.?vec3(0.,0.,.95):k<2.?vec3(.07):k<3.?vec3(.95,0.,.95):k<4.?vec3(.07):k<5.?vec3(0.,.95,.95):k<6.?vec3(.07):vec3(.95); }
 c*=.9+.1*sin(u.y*uRes.y*1.5); c+=(hash21(u*uRes+floor(t*30.))-.5)*.1; c=mix(c,vec3(luma(c)),.0);
 return c*(1.-.5*dot(uv-.5,uv-.5)); }`),

  // ------------------------------------------------------------ FITNESS & ENERGY
  G('energy', 'Energy Burst', 'fitness', `
vec3 gen(vec2 uv,vec2 p,float t){
 float r=length(p); float a=atan(p.y,p.x); vec3 col=mix(vec3(.1,.0,.0),vec3(.35,.04,.0),exp(-r*2.));
 float k=fract(t*.7); float ring=smoothstep(.06,.0,abs(r-k*1.1))*(1.-k); col+=vec3(1.,.6,.1)*ring*1.4;
 float rays=pow(.5+.5*sin(a*14.+t*2.+fbm(p*4.+t)*3.),4.); col+=vec3(1.,.35,.05)*rays*exp(-r*2.8)*.9; col+=vec3(1.,.8,.4)*exp(-r*9.)*1.1; return col; }`),
  G('fire', 'Blaze', 'fitness', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=vec2(p.x*2.4,uv.y*2.2-t*.9); float n=fbm(q*2.+vec2(0.,-t*.7)); float n2=fbm(q*4.+vec2(5.,-t*1.3));
 float f=(n*.65+n2*.35)-uv.y*1.3+.14-abs(p.x)*.7; f=clamp(f*2.4,0.,1.);
 vec3 c=mix(vec3(.05,0.,0.),vec3(.9,.12,.0),smoothstep(0.,.3,f)); c=mix(c,vec3(1.,.55,.05),smoothstep(.3,.7,f)); c=mix(c,vec3(1.,.9,.55),smoothstep(.75,1.,f)); return c; }`),
  G('lightning', 'Storm Lightning', 'fitness', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.02,.03,.07),vec3(.08,.1,.18),uv.y)+vec3(.05,.07,.12)*fbm(vec2(p.x*2.+t*.05,uv.y*3.))*uv.y;
 float tt=floor(t*1.6); float f=fract(t*1.6); float trig=step(.55,hash(tt)); float x0=(hash(tt+3.)-.5)*.8;
 float xx=p.x-x0+ (fbm(vec2(uv.y*9.,tt))-.5)*.35*(1.-uv.y*.3); float bolt=exp(-abs(xx)*90.)*smoothstep(.0,.15,uv.y)*step(0.,uv.y); float flash=pow(max(0.,1.-f*5.),2.)*trig;
 col+=vec3(.7,.8,1.)*(bolt*1.4+exp(-abs(xx)*10.)*.3)*flash*2.+vec3(.4,.5,.8)*flash*.5*uv.y; return col; }`),
  G('speedlines', 'Action Lines', 'fitness', `
vec3 gen(vec2 uv,vec2 p,float t){
 float a=atan(p.y,p.x); float r=length(p); float n=hash(floor(a*60.)+floor(t*16.)*17.); float ray=smoothstep(.55,.95,n)*smoothstep(.12,.55,r);
 vec3 bg=mix(vec3(1.,.82,.1),vec3(1.,.45,.05),r); return mix(bg,vec3(.08,.02,.0),ray); }`),

  // ------------------------------------------------------------ CINEMATIC
  G('lightleaks', 'Light Leaks', 'cinema', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(0.); for(int i=0;i<4;i++){ float fi=float(i); vec2 c=vec2(sin(t*.35+fi*2.1)*.7,cos(t*.28+fi*1.7)*.5); float g=exp(-length((p-c)*vec2(1.,1.5))*(2.4+fi*.4));
  col+=mix(vec3(1.,.35,.1),vec3(1.,.15,.5),fract(fi*.37+t*.03))*g*.85; } col+=vec3(1.,.6,.2)*fbm(p*3.+t*.2)*.18*exp(-length(p)*.6); return col; }`),
  G('filmgate', 'Film Gate', 'cinema', `
vec3 gen(vec2 uv,vec2 p,float t){
 float f=floor(t*18.); vec3 col=vec3(.5+.12*(hash(f)-.5)); col+=(hash21(uv*uRes*.5+f)-.5)*.22; col*=vec3(1.,.95,.86);
 col*=1.-.7*dot(p,p)*1.4; float sc=step(.985,hash(f*3.+floor(uv.x*70.)))*smoothstep(.0,.3,hash(f+floor(uv.x*70.)*.1)); col+=vec3(.5)*sc*.5;
 vec2 g=p*vec2(26.,26.); vec2 id=floor(g+f*3.1); col+=vec3(.8)*step(.993,hash21(id))*smoothstep(.5,.0,length(fract(g)-.5)); return col; }`),
  G('lensflare', 'Anamorphic Flare', 'cinema', `
vec3 gen(vec2 uv,vec2 p,float t){
 float k=fract(t*.12); vec2 c=vec2(mix(-.9,.9,k),sin(k*6.28)*.12); vec2 d=p-c; vec3 col=vec3(0.);
 col+=vec3(.5,.7,1.)*exp(-abs(d.y)*70.)*exp(-abs(d.x)*1.1)*.9; col+=vec3(1.,.85,.6)*exp(-length(d)*18.)*1.2;
 for(int i=1;i<5;i++){ float fi=float(i); vec2 gp=-c*fi*.35; col+=hsv2rgb(vec3(fract(fi*.17),.5,1.))*smoothstep(.07+fi*.01,.05,length(p-gp))*.1; } return col; }`),
  G('goldglitter', 'Gold Glitter', 'cinema', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.04,.025,.01),vec3(.1,.06,.02),uv.y);
 for(int i=0;i<4;i++){ float fi=float(i); vec2 q=p*(14.+fi*14.); q.y+=t*(.25+fi*.2); q.x+=sin(t*.3+fi)*.5; vec2 id=floor(q); vec2 f=fract(q)-.5; float h=hash21(id+fi*9.);
  float tw=pow(.5+.5*sin(t*(2.+h*5.)+h*50.),6.); vec2 off=(hash22(id)-.5)*.6; vec2 d=f-off; float s=exp(-length(d)*34.)+(exp(-abs(d.x)*60.)*exp(-abs(d.y)*9.)+exp(-abs(d.y)*60.)*exp(-abs(d.x)*9.))*.5;
  col+=vec3(1.,.8,.4)*s*tw*step(.5,h)*1.4; } return col; }`),

  // ------------------------------------------------------------ EDUCATION
  G('chalkboard', 'Chalkboard', 'edu', `
float chalk(float d,float w,vec2 p){ return smoothstep(w,0.,abs(d))*(.65+.35*noise(p*160.)); }
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.07,.14,.12),vec3(.12,.21,.18),fbm(p*4.+1.)); col+=vec3(.6)*smoothstep(.5,.9,fbm(p*vec2(3.,2.)+vec2(0.,t*.03)))*.08;
 float s=min(uRes.x/uRes.y,1.); float ch=0.; vec2 w=vec2(noise(p*14.+t*.1),noise(p*14.+9.))*.01-.005;
 vec2 c1=vec2(-.12*s+sin(t*.4)*.04,.18+cos(t*.3)*.03); ch+=chalk(length(p-c1+w)-.1*s,.007,p);
 vec2 d2=p-vec2(.12*s,-.08+sin(t*.35)*.03)+w; ch+=chalk(max(abs(d2.x),abs(d2.y))-.09*s,.007,p);
 vec2 d3=rot2(t*.2)*(p-vec2(-.1*s,-.26))+w; ch+=chalk(max(abs(d3.x)*.866+d3.y*.5,-d3.y)-.08*s,.007,p);
 float zz=p.y+.38; float zig=abs(fract((p.x+t*.05)*5./s)-.5)*.08-.04; ch+=chalk(zz-zig*.5,.006,p)*step(abs(p.x),.4*s);
 col+=vec3(.95,.97,.9)*clamp(ch,0.,1.)*.85; col+=vec3(.9)*step(.996,hash21(floor(p*110.+t*2.)))*.25; return col; }`),
  G('gridpaper', 'Blueprint Grid', 'edu', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.04,.14,.32),vec3(.06,.22,.46),uv.y); vec2 g=p*vec2(1.,1.)*18.; vec2 f=abs(fract(g)-.5); float minor=smoothstep(.02,.0,.5-max(f.x,f.y)+.0)*0.;
 float l1=smoothstep(.035,.0,min(.5-f.x,.5-f.y)); vec2 g2=p*3.6; vec2 f2=abs(fract(g2)-.5); float l2=smoothstep(.02,.0,min(.5-f2.x,.5-f2.y));
 col+=vec3(.5,.75,1.)*(l1*.18+l2*.35); float sc=fract(t*.12); col+=vec3(.4,.8,1.)*exp(-abs(uv.x-sc)*40.)*.2; return col; }`),
  G('geoshapes', 'Flat Shapes', 'edu', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.98,.95,.9); for(int i=0;i<7;i++){ float fi=float(i); vec2 c=vec2(sin(t*.25+fi*2.3)*.55*(1.+fi*.05),cos(t*.2+fi*1.7)*.38); vec2 d=rot2(t*(.2+fi*.07)*(mod(fi,2.)*2.-1.))*(p-c); float r=.1+.05*fract(fi*.37);
  float sh; if(mod(fi,3.)<1.) sh=smoothstep(r,r-.004,length(d)); else if(mod(fi,3.)<2.) sh=smoothstep(r,r-.004,max(abs(d.x),abs(d.y))*1.2); else sh=smoothstep(r,r-.004,max(abs(d.x)*.866+d.y*.5,-d.y)*1.2);
  col=mix(col,hsv2rgb(vec3(fract(fi*.14+.02),.65,1.)),sh*.95); } return col; }`),
  G('gradmesh', 'Presentation Gradient', 'edu', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=uv+.14*vec2(sin(t*.3+uv.y*3.),cos(t*.25+uv.x*3.)); vec3 c1=vec3(.1,.3,1.),c2=vec3(.65,.15,.95),c3=vec3(.05,.8,.9),c4=vec3(1.,.35,.6);
 vec3 col=mix(mix(c1,c2,q.x),mix(c3,c4,q.x),q.y); col=mix(col,vec3(.4,.2,1.),.25*(.5+.5*sin(t*.2+q.x*4.))); col*=.88+.14*noise(p*3.+t*.1); return col; }`),
  // ------------------------------------------------------------ TRAVEL
  G('mountains', 'Sunset Mountains', 'travel', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 sky=skyGrad(uv.y,vec3(1.,.72,.38),vec3(.95,.42,.5),vec3(.22,.22,.52)); float sr=length(vec2(p.x,p.y-.02));
 sky+=vec3(1.,.8,.5)*exp(-sr*5.)*.7; sky=mix(sky,vec3(1.,.95,.78),smoothstep(.1,.095,sr)); vec3 col=sky;
 for(int i=0;i<5;i++){ float fi=float(i); float h=.4-fi*.075+ridge(p.x*(1.1+fi*.15),fi*7.3,.22,t,.01*(fi+1.))*(.5+.2*fi);
  float m=smoothstep(.004,-.004,uv.y-h); vec3 c=mix(vec3(.62,.34,.5),vec3(.05,.035,.13),fi/4.); c=mix(c,sky,.2*(1.-fi/4.)*smoothstep(.0,.3,h-uv.y+.15)); col=mix(col,c,m); }
 return col; }`),
  G('dunes', 'Desert Dunes', 'travel', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(1.,.82,.6),vec3(.45,.6,.85),smoothstep(.35,1.,uv.y)); col+=vec3(1.,.8,.5)*exp(-length(p-vec2(.2,.08))*3.)*.3;
 for(int i=0;i<5;i++){ float fi=float(i); float ph=p.x*(1.5+fi*.4)+fi*2.+t*.04*(fi+1.); float y=.52-fi*.095+.06*sin(ph)+.02*sin(p.x*5.+fi*3.);
  float m=smoothstep(.004,-.004,uv.y-y); float shade=smoothstep(-.4,.4,cos(ph)); vec3 base=mix(vec3(.95,.62,.34),vec3(.6,.3,.16),fi/4.);
  vec3 c=mix(base*.62,base*1.08,shade); c=mix(c,vec3(1.,.8,.6),(1.-fi/4.)*.3); col=mix(col,c,m); }
 return col; }`),
  G('beach', 'Beach Waves', 'travel', `
vec3 gen(vec2 uv,vec2 p,float t){
 float cyc=.5+.5*sin(t*.55); float edge=.46+.05*sin(p.x*5.+t*.3)+.025*sin(p.x*11.-t*.5)+.1*(cyc-.5); float d=uv.y-edge;
 vec3 sand=mix(vec3(.97,.86,.66),vec3(.85,.71,.5),noise(p*20.)*.6+noise(p*80.)*.4); sand=mix(sand*.82,sand,smoothstep(.0,.12,d));
 vec3 shallow=vec3(.3,.88,.82),deep=vec3(.02,.36,.56); vec3 water=mix(shallow,deep,smoothstep(0.,.5,-d)); water+=vec3(.12)*sin(-d*46.-t*1.6+sin(p.x*8.)*.5)*smoothstep(.0,.35,-d);
 vec3 col=d>0.?sand:water; float foam=smoothstep(.05,.0,abs(d+.012))+smoothstep(.035,.0,abs(d+.14+.05*sin(p.x*9.+t)))*.6; return mix(col,vec3(1.),clamp(foam,0.,1.)*.85); }`),
  G('roadtrip', 'Road Trip', 'travel', `
vec3 gen(vec2 uv,vec2 p,float t){
 float hz=.45; vec3 col=skyGrad(uv.y,vec3(1.,.6,.3),vec3(.8,.4,.5),vec3(.25,.3,.6)); col+=vec3(1.,.8,.5)*exp(-length(p-vec2(0.,hz-.5))*6.)*.7;
 if(uv.y<hz){ float z=1./(hz-uv.y+.01); float rw=.0+z*.12; float road=smoothstep(rw+.003,rw-.003,abs(p.x)); vec3 grass=mix(vec3(.12,.2,.08),vec3(.3,.35,.12),noise(vec2(p.x*z*2.,z*3.-t*3.)));
  col=mix(grass,vec3(.12,.12,.14),road); float dash=step(.5,fract(z*.35-t*.8))*smoothstep(.003+z*.002,.0,abs(p.x))*road; col=mix(col,vec3(1.,.9,.5),dash); col*=exp(-.0*z); col=mix(col,vec3(1.,.7,.45),exp(-z*.0)*0.); }
 col=mix(col,vec3(1.,.65,.4),exp(-abs(uv.y-hz)*30.)*.5); col+=vec3(0.)+ (ridge(p.x,2.,.06,t,.003)>uv.y-hz-.01?1.:0.)*vec3(.0)*0.; return col; }`),

  // ------------------------------------------------------------ ROMANCE
  G('hearts', 'Floating Hearts', 'romance', `
float heartSDF(vec2 p){ p.x=abs(p.x); if(p.y+p.x>1.) return sqrt(dot(p-vec2(.25,.75),p-vec2(.25,.75)))-sqrt(2.)/4.; return sqrt(min(dot(p-vec2(0.,1.),p-vec2(0.,1.)),dot(p-.5*max(p.x+p.y,0.),p-.5*max(p.x+p.y,0.))))*sign(p.x-p.y); }
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.45,.05,.2),vec3(.85,.2,.4),uv.y); col+=vec3(1.,.5,.6)*exp(-length(p)*1.6)*.25;
 for(int i=0;i<3;i++){ float fi=float(i); vec2 q=p*(3.5+fi*2.8); q.y-=t*(.45+fi*.25); q.x+=sin(q.y*.7+fi*2.)*.3; vec2 id=floor(q); vec2 f=fract(q)-.5; float h=hash21(id+fi*5.);
  f-=(hash22(id)-.5)*.35; f=rot2((h-.5)*.6+sin(t+h*9.)*.15)*f; float sc=.42+h*.4; vec2 hq=f/sc*1.25+vec2(0.,.5); float hv=heartSDF(hq);
  float m=smoothstep(.02,-.02,hv)*step(.4,hash21(id+fi*9.)); vec3 hc=mix(vec3(1.,.45,.62),vec3(1.,.85,.9),smoothstep(-.1,.4,hq.y)*.6+h*.3);
  col=mix(col,hc,m*(.78+.22*fi/2.)); col+=vec3(1.)*smoothstep(.03,.0,abs(hv+.03))*m*.25; }
 return col; }`),
  G('petals', 'Rose Petals', 'romance', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.12,.03,.07),vec3(.3,.06,.14),uv.y)+vec3(1.,.4,.5)*exp(-length(p-vec2(0.,.2))*2.)*.12;
 for(int i=0;i<3;i++){ float fi=float(i); vec2 q=p*(4.5+fi*3.5); q.y+=t*(.4+fi*.25); q.x+=sin(q.y*.8+fi*3.)*.6; vec2 id=floor(q); vec2 f=fract(q)-.5; float h=hash21(id+fi*7.);
  f-=(hash22(id)-.5)*.4; f=rot2(t*(.4+h)+h*20.)*f; f.x*=1.0+.5*sin(t*1.7+h*10.); float d=length(f*vec2(1.,2.1)); float m=smoothstep(.22,.19,d)*step(.45,hash21(id+fi*3.));
  col=mix(col,mix(vec3(.85,.1,.25),vec3(1.,.4,.5),h)*(.7+.3*f.y*2.),m); }
 return col; }`),
  G('sparkles', 'Magic Sparkles', 'romance', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.08,.02,.18),vec3(.2,.05,.3),uv.y)+vec3(.9,.3,.7)*exp(-length(p)*2.)*.2;
 for(int i=0;i<4;i++){ float fi=float(i); vec2 q=p*(10.+fi*9.); q.y-=t*(.15+fi*.1); vec2 id=floor(q); vec2 f=fract(q)-.5; float h=hash21(id+fi*9.); vec2 d=f-(hash22(id)-.5)*.6;
  float tw=pow(.5+.5*sin(t*(1.5+h*4.)+h*60.),5.); float s=exp(-length(d)*30.)+(exp(-abs(d.x)*70.)*exp(-abs(d.y)*7.)+exp(-abs(d.y)*70.)*exp(-abs(d.x)*7.))*.7; col+=hsv2rgb(vec3(fract(.85+h*.2),.35,1.))*s*tw*step(.5,h)*1.5; }
 return col; }`),

  // ------------------------------------------------------------ DARK & HORROR
  G('fog', 'Haunted Fog', 'dark', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*1.8+vec2(t*.05,0.); float f=fbm(q+fbm(q*1.6-t*.04)*1.2); vec3 col=mix(vec3(.015,.02,.03),vec3(.36,.43,.46),f*f*2.3);
 float fl=.65+.35*step(.4,hash(floor(t*9.)))*hash(floor(t*31.)); col+=vec3(.5,.55,.45)*exp(-length(p-vec2(.2,.1))*3.)*.22*fl; col*=1.-.55*dot(p,p)*1.6; return col; }`),
  G('bloodmoon', 'Blood Moon', 'dark', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.02,.0,.02),vec3(.12,.0,.04),uv.y); col+=vec3(star(p,t,50.))*.5; vec2 c=vec2(.0,.12); float r=length(p-c); float moon=smoothstep(.2,.195,r);
 vec3 mc=mix(vec3(.55,.03,.03),vec3(.95,.25,.12),fbm((p-c)*9.)); col=mix(col,mc*(.7+.3*smoothstep(.2,-.1,(p-c).x)),moon); col+=vec3(.9,.1,.05)*exp(-(r-.2)*8.)*.35*(r>.2?1.:0.);
 float cl=fbm(vec2(p.x*2.5+t*.07,p.y*6.)); col=mix(col,vec3(.03,.0,.02),smoothstep(.55,.8,cl)*smoothstep(.4,.7,1.-abs(uv.y-.4)*2.)*.85); return col; }`),
  G('vhsstatic', 'Static Noise', 'dark', `
vec3 gen(vec2 uv,vec2 p,float t){
 float f=floor(t*30.); float n=hash21(floor(uv*uRes*.5)+f); float band=step(.97,hash(floor(uv.y*14.)+f))*.4; float roll=smoothstep(.0,.04,abs(fract(uv.y-t*.2)-.5)-.45);
 vec3 col=vec3(n*.55+band)+vec3(.0,.02,.05); col*=.8+.2*sin(uv.y*uRes.y*1.6); col.r+=hash21(floor(uv*uRes*.5)+f+3.)*.05; col*=1.-.3*roll; return col; }`),

  // ------------------------------------------------------------ FUN & HOLIDAY
  G('confettipop', 'Confetti Party', 'fun', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.25,.1,.6),vec3(.55,.2,.8),uv.y);
 for(int i=0;i<4;i++){ float fi=float(i); vec2 q=p*(8.+fi*5.); q.y+=t*(.9+fi*.5); q.x+=sin(q.y*.8+fi*2.)*.3; vec2 id=floor(q); vec2 f=fract(q)-.5; float h=hash21(id+fi*7.);
  vec2 d=rot2(t*(2.+h*6.)+h*20.)*(f-(hash22(id)-.5)*.4); float sq=smoothstep(.1,.07,max(abs(d.x),abs(d.y)*2.6)); col=mix(col,hsv2rgb(vec3(h,.75,1.)),sq*step(.35,hash21(id+fi*3.))); }
 return col; }`),
  G('bubbles', 'Soap Bubbles', 'fun', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.55,.8,.95),vec3(.85,.95,1.),uv.y);
 for(int i=0;i<3;i++){ float fi=float(i); vec2 q=p*(3.+fi*2.5); q.y-=t*(.25+fi*.12); q.x+=sin(t*.5+q.y*.8+fi*2.)*.3; vec2 id=floor(q); vec2 f=fract(q)-.5; float h=hash21(id+fi*7.);
  vec2 d=f-(hash22(id)-.5)*.4; float r=.14+.18*h; float dl=length(d); float rim=smoothstep(.03,.0,abs(dl-r)); float body=smoothstep(r,r-.01,dl)*.1;
  vec3 irid=hsv2rgb(vec3(fract(atan(d.y,d.x)/6.28318+dl*3.+t*.1),.45,1.)); float hl=smoothstep(.05,.0,length(d-vec2(-.4,.4)*r))*.8; col+=(irid*rim*.9+vec3(body)+vec3(hl))*step(.4,hash21(id+fi*3.)); }
 return col; }`),
  G('rainbow', 'Rainbow Burst', 'fun', `
vec3 gen(vec2 uv,vec2 p,float t){
 float r=length(p-vec2(0.,-.55)); vec3 col=mix(vec3(.55,.8,1.),vec3(.85,.95,1.),uv.y); float k=r*3.2-t*.15; float band=smoothstep(.0,.04,fract(k*1.)*0.+1.)*0.;
 float m=smoothstep(.55,.62,r)*smoothstep(1.2,1.0,r)*0.; float w=r*1.8; vec3 rb=hsv2rgb(vec3(fract(1.-(r-.5)*1.3+t*.04),.8,1.)); float arc=smoothstep(.5,.55,r)*smoothstep(1.05,1.,r);
 col=mix(col,rb,arc*.9); col+=vec3(1.)*fbm(vec2(p.x*2.+t*.05,p.y*5.))*.1*smoothstep(.3,.9,fbm(p*3.+t*.05)); return col; }`),
  G('fireworks', 'Fireworks', 'fun', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.01,.01,.05),vec3(.04,.03,.12),uv.y)+vec3(star(p,t,50.))*smoothstep(.5,.9,uv.y)*.6;
 for(int i=0;i<5;i++){ float fi=float(i); float cyc=t*.55+fi*.37; float id=floor(cyc); float f=fract(cyc); vec2 c=vec2((hash(id*7.+fi)-.5)*1.1,(hash(id*3.+fi*5.)-.5)*.5+.12); vec3 colr=hsv2rgb(vec3(hash(id+fi*9.),.7,1.));
  float rise=smoothstep(.0,.2,f); vec2 d=p-c; if(f<.22){ vec2 rp=vec2(c.x,mix(-.55,c.y,f/.22)); col+=vec3(1.,.8,.5)*exp(-length(p-rp)*60.); }
  else { float tt=(f-.22)/.78; float rad=tt*.42; float r=length(d); float a=atan(d.y,d.x); float spark=step(.5,hash(floor(a*24./6.28318)+id*13.+fi)); float ring=exp(-abs(r-rad*(.7+.3*hash(floor(a*24./6.28318)+id)))*38.); float fade=(1.-tt)*(1.-tt); col+=colr*ring*fade*(.8+spark)*3.2*smoothstep(.0,.05,tt); col+=colr*exp(-r*14.)*pow(1.-tt,3.)*.9; } }
 return col; }`),
  ...EXTRA_GENERATORS,
  ...REAL_GENERATORS,
];

export const genById = (id) => GENERATORS.find((g) => g.id === id);
