// Additional transitions, effects and colour looks. Same formats as effects.js (spread into the main catalogs there).
const P = (k, name, min, max, def, step) => ({ k, name, min, max, def, step: step || (max - min) / 100 });
const INT = P('amt', 'Intensity', 0, 1, 0.7);
const SPD = (def = 1) => P('p0', 'Speed', 0.1, 4, def, 0.05);
const L = (o) => ({ sat: 1, con: 1, bri: 0, fade: 0, sh: [0, 0, 0], hi: [0, 0, 0], tint: 0, gam: [1, 1, 1], bw: 0, vig: 0, grain: 0, ...o });

// ------------------------------------------------------------------ TRANSITIONS
export const EXTRA_TRANSITIONS = [
  { id: 'flip', name: 'Flip', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){
 float a=p*PI; float c=cos(a); float s=sign(c)+1e-4; float w=max(abs(c),.0001);
 vec2 u=vec2((uv.x-.5)/w+.5,uv.y); float persp=1.+(uv.y-.5)*.0; 
 u.y=(uv.y-.5)/(1.-.12*sin(a)*(uv.x-.5)*s)+.5;
 vec4 col=p<.5?A(u):B(vec2(1.-u.x+0.,u.y)*vec2(1.,1.)); if(!in01(u)) return vec4(0.,0.,0.,1.);
 return vec4(col.rgb*(.55+.45*w),1.); }` },
  { id: 'flipv', name: 'Flip Vertical', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){
 float a=p*PI; float c=cos(a); float w=max(abs(c),.0001); vec2 u=vec2(uv.x,(uv.y-.5)/w+.5);
 if(!in01(u)) return vec4(0.,0.,0.,1.); vec4 col=p<.5?A(u):B(vec2(u.x,1.-u.y)); return vec4(col.rgb*(.55+.45*w),1.); }` },
  { id: 'cube', name: 'Cube Turn', cat: 'Slide', glsl: `vec4 transition(vec2 uv,float p){
 float e=p*p*(3.-2.*p); float x=uv.x; float split=1.-e;
 if(x<split){ float k=x/split; float sc=mix(1.,.82,e); vec2 u=vec2(k,(uv.y-.5)/(1.-.18*e*(1.-k))+.5); return in01(u)?vec4(A(u).rgb*(1.-.45*e),1.):vec4(0.,0.,0.,1.); }
 float k=(x-split)/(1.-split+1e-4); vec2 u=vec2(k,(uv.y-.5)/(1.-.18*(1.-e)*k)+.5); return in01(u)?vec4(B(u).rgb*(.55+.45*e),1.):vec4(0.,0.,0.,1.); }` },
  { id: 'diamond', name: 'Diamond', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){ vec2 q=abs(uv-.5)*vec2(aspect(),1.); float d=q.x+q.y; float R=p*(.5*aspect()+.5+.1); float m=1.-smoothstep(R-.015,R+.015,d); return mix(A(uv),B(uv),m); }` },
  { id: 'circles', name: 'Polka Dots', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){
 vec2 g=uv*vec2(aspect(),1.)*9.; vec2 f=fract(g)-.5; float rad=p*.95; float m=1.-smoothstep(rad-.03,rad+.03,length(f)); return mix(A(uv),B(uv),m); }` },
  { id: 'checker', name: 'Checkerboard', cat: 'Shape', glsl: `vec4 transition(vec2 uv,float p){
 vec2 g=floor(uv*vec2(aspect(),1.)*8.); float chk=mod(g.x+g.y,2.); vec2 f=fract(uv*vec2(aspect(),1.)*8.); float d=max(abs(f.x-.5),abs(f.y-.5))*2.;
 float th=clamp(p*1.6-chk*.5,0.,1.); float m=1.-smoothstep(th-.02,th+.02,d); m=max(m,step(.99,p)); return mix(A(uv),B(uv),m); }` },
  { id: 'stripes', name: 'Stripes', cat: 'Wipe', glsl: `vec4 transition(vec2 uv,float p){
 float n=8.; float id=floor(uv.x*n); float f=fract(uv.x*n); float dir=mod(id,2.)*2.-1.; float y=dir>0.?uv.y:1.-uv.y;
 float th=p*1.3-id/n*.3; float m=smoothstep(th-.03,th+.03,1.-y)*0.+1.-smoothstep(th-.03,th+.03,y); return mix(A(uv),B(uv),clamp(m,0.,1.)); }` },
  { id: 'sliceh', name: 'Slice Horizontal', cat: 'Slide', glsl: `vec4 transition(vec2 uv,float p){
 float n=7.; float id=floor(uv.y*n); float dir=mod(id,2.)*2.-1.; float e=p*p*(3.-2.*p);
 vec2 ua=vec2(uv.x+dir*e,uv.y); vec2 ub=vec2(uv.x-dir*(1.-e),uv.y); return in01(ub)&&e>0.?(p>.5||in01(ua)==false?B(ub):A(ua)):A(ua); }` },
  { id: 'slicev', name: 'Slice Vertical', cat: 'Slide', glsl: `vec4 transition(vec2 uv,float p){
 float n=7.; float id=floor(uv.x*n); float dir=mod(id,2.)*2.-1.; float e=p*p*(3.-2.*p);
 vec2 ua=vec2(uv.x,uv.y+dir*e); vec2 ub=vec2(uv.x,uv.y-dir*(1.-e)); if(in01(ua)&&p<.5) return A(ua); if(in01(ub)) return B(ub); return A(clamp(ua,0.,1.)); }` },
  { id: 'bounce', name: 'Bounce In', cat: 'Slide', glsl: `vec4 transition(vec2 uv,float p){
 float e=abs(cos(p*PI*2.5))*(1.-p)*(1.-p)*1.3; vec2 u=uv+vec2(0.,e)*.0; float y=(1.-p<1.-1e-3)?e:0.; vec2 ub=vec2(uv.x,uv.y+(1.-smoothstep(0.,.55,p))*1.+y*.25);
 return in01(ub)?B(ub):A(uv); }` },
  { id: 'vortex', name: 'Vortex', cat: 'Zoom', glsl: `vec4 transition(vec2 uv,float p){
 vec2 q=(uv-.5)*vec2(aspect(),1.); float r=length(q); float k=sin(p*PI); float a=k*9.*exp(-r*3.2); vec2 u=clamp(rot2(a)*q/vec2(aspect(),1.)*(1.-.35*k)+.5,0.,1.);
 vec4 c=mix(A(u),B(u),smoothstep(.4,.6,p)); return vec4(c.rgb*(1.-.35*k*exp(-r*5.)),1.); }` },
  { id: 'ink', name: 'Ink Bleed', cat: 'Distort', glsl: `vec4 transition(vec2 uv,float p){
 float n=fbm(uv*vec2(aspect(),1.)*4.+vec2(0.,p*.6)); float d=length((uv-.5)*vec2(aspect(),1.))*.6; float v=n*.7+d*.9; float th=p*1.7-.1;
 float m=1.-smoothstep(th-.05,th+.05,v); float edge=smoothstep(.1,0.,abs(v-th))*.6; vec4 c=mix(A(uv),B(uv),m); return vec4(c.rgb*(1.-edge*.7),1.); }` },
  { id: 'smoke', name: 'Smoke', cat: 'Blur', glsl: `vec4 transition(vec2 uv,float p){
 float n=fbm(uv*vec2(aspect(),1.)*3.+vec2(p*1.2,-p)); float th=p*1.5-.25; float m=smoothstep(th-.25,th+.25,1.-n*1.1+0.);
 m=1.-clamp(m,0.,1.); float k=sin(p*PI); vec2 d=vec2(n-.5)*.04*k; vec4 a=A(uv+d), b=B(uv-d); vec4 c=mix(a,b,m); return vec4(mix(c.rgb,vec3(.75),.12*k),1.); }` },
  { id: 'lightleak', name: 'Light Leak', cat: 'Light', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI); float n=fbm(uv*2.5+vec2(p*2.,0.)); float g=exp(-pow((uv.x-p*1.4+.2+n*.2)*3.2,2.)); vec3 leak=mix(vec3(1.,.35,.1),vec3(1.,.85,.4),n)*g*1.8+vec3(1.,.5,.3)*k*.25;
 vec4 c=mix(A(uv),B(uv),smoothstep(.38,.62,p)); return vec4(1.-(1.-c.rgb)*(1.-clamp(leak*k*1.3,0.,1.)),1.); }` },
  { id: 'shake', name: 'Whip Shake', cat: 'Blur', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI); vec2 dir=vec2(1.,.15); vec4 s=vec4(0.); for(int i=0;i<14;i++){ float f=float(i)/13.-.5; vec2 u=clamp(uv+dir*f*k*.28+vec2(sin(p*40.)*.012*k,cos(p*33.)*.012*k),0.,1.); s+=mix(A(u),B(u),smoothstep(.42,.58,p)); }
 return s/14.; }` },
  { id: 'strobe', name: 'Strobe Cut', cat: 'Light', glsl: `vec4 transition(vec2 uv,float p){
 float f=floor(p*8.); float flash=step(.5,fract(p*8.))*smoothstep(0.,.2,p)*smoothstep(1.,.8,p); vec4 c=mod(f,2.)<1.?A(uv):B(uv); if(p>.62) c=B(uv); return vec4(mix(c.rgb,vec3(1.),flash*.65),1.); }` },
  { id: 'dreamy', name: 'Dreamy Blur', cat: 'Blur', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI); vec4 s=vec4(0.); float tot=0.; for(int i=0;i<16;i++){ float a=float(i)*2.39996; float r=sqrt(float(i)/16.)*.035*k; vec2 u=clamp(uv+vec2(cos(a),sin(a))*r,0.,1.); s+=mix(A(u),B(u),smoothstep(.3,.7,p)); tot+=1.; }
 vec3 c=s.rgb/tot; c=c*(1.+.25*k)+vec3(.08,.05,.1)*k; return vec4(c,1.); }` },
  { id: 'prism', name: 'Prism Split', cat: 'Glitch', glsl: `vec4 transition(vec2 uv,float p){
 float k=sin(p*PI); float sp=.05*k; float m=smoothstep(.4,.6,p); vec2 d=vec2(sp,0.);
 vec3 a=vec3(mix(A(uv+d).r,B(uv+d).r,m),mix(A(uv).g,B(uv).g,m),mix(A(uv-d).b,B(uv-d).b,m)); a+=vec3(.9,.9,1.)*k*.06; return vec4(a,1.); }` },
  { id: 'lens', name: 'Lens Warp', cat: 'Zoom', glsl: `vec4 transition(vec2 uv,float p){
 vec2 q=(uv-.5)*vec2(aspect(),1.); float r=length(q); float k=sin(p*PI); float f=1.+k*1.4*r*r*2.2-k*.25; vec2 u=clamp(q*f/vec2(aspect(),1.)+.5,0.,1.);
 vec4 c=mix(A(u),B(u),smoothstep(.4,.6,p)); return vec4(c.rgb*(1.-k*.25*r),1.); }` },
];

// ------------------------------------------------------------------ EFFECTS
export const EXTRA_EFFECTS = [
  { id: 'chromatic', name: 'Chromatic Edge', cat: 'Glitch', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec2 c=uv-.5; float r=length(c); vec2 d=c*r*.06*uAmt*(1.+.3*sin(uT*uP.x*2.));
 return vec4(S(uv+d).r,S(uv).g,S(uv-d).b,S(uv).a); }` },
  { id: 'lightrays', name: 'Light Rays', cat: 'Light', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec4 base=S(uv); vec2 c=vec2(.8,.15); vec2 d=(uv-c); float a=atan(d.y,d.x); float r=length(d);
 float ray=pow(max(0.,sin(a*14.+uT*uP.x*.5)*.5+.5),3.)*pow(max(0.,sin(a*5.-uT*uP.x*.3)*.5+.5),2.)*exp(-r*1.4);
 vec3 c2=base.rgb+vec3(1.,.85,.55)*ray*uAmt*.7; return vec4(c2,base.a); }` },
  { id: 'hearts', name: 'Floating Hearts', cat: 'Overlay', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec4 base=S(uv); vec3 col=base.rgb; vec2 p=uv*vec2(aspect(),1.);
 for(int i=0;i<12;i++){ float fi=float(i); float sp=.12+.1*hash(fi*3.1); float y=fract(hash(fi*7.7)+uT*uP.x*sp); float x=hash(fi*1.3)*aspect()+.03*sin(uT*uP.x*1.5+fi*2.);
  vec2 q=(p-vec2(x,y*1.3-.15))/(.035+.03*hash(fi*9.)); q.y=-q.y+.2; float xx=abs(q.x); float v=pow(xx*xx+q.y*q.y-1.,3.)-xx*xx*q.y*q.y*q.y;
  float m=(1.-smoothstep(-.1,.1,v))*smoothstep(0.,.15,y)*smoothstep(1.,.7,y); col=mix(col,vec3(1.,.35,.5),m*uAmt*.85); }
 return vec4(col,base.a); }` },
  { id: 'bubbles', name: 'Bubbles', cat: 'Overlay', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec4 base=S(uv); vec3 col=base.rgb; vec2 p=uv*vec2(aspect(),1.);
 for(int i=0;i<14;i++){ float fi=float(i); float sp=.08+.1*hash(fi*2.2); float y=fract(hash(fi*5.1)+uT*uP.x*sp); float x=hash(fi*1.7)*aspect()+.02*sin(uT*uP.x+fi*3.); float r=.012+.03*hash(fi*8.8);
  vec2 d=p-vec2(x,y*1.2-.1); float l=length(d); float ring=smoothstep(.003,.0,abs(l-r)); float fill=smoothstep(r,0.,l)*.08; float hl=smoothstep(r*.35,0.,length(d-vec2(-.3,.3)*r))*.8;
  col+=vec3(.8,.95,1.)*(ring*.7+fill+hl)*uAmt*smoothstep(1.,.8,y); }
 return vec4(col,base.a); }` },
  { id: 'leaves', name: 'Falling Leaves', cat: 'Overlay', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec4 base=S(uv); vec3 col=base.rgb; vec2 p=uv*vec2(aspect(),1.);
 for(int i=0;i<10;i++){ float fi=float(i); float y=1.1-fract(hash(fi*4.3)+uT*uP.x*(.07+.06*hash(fi*1.1)))*1.3; float x=hash(fi*2.9)*aspect()+.08*sin(uT*uP.x*.9+fi*2.);
  vec2 d=rot2(fi+uT*uP.x*(.7+hash(fi)))*(p-vec2(x,y)); float m=smoothstep(.03,.025,length(d*vec2(1.,2.2)));
  col=mix(col,mix(vec3(.9,.3,.05),vec3(1.,.7,.1),hash(fi*6.)),m*uAmt*.9); }
 return vec4(col,base.a); }` },
  { id: 'edgeglow', name: 'Neon Edges', cat: 'Stylize', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec2 px=1./uRes*1.2; float l=luma(S(uv).rgb); float gx=luma(S(uv+vec2(px.x,0.)).rgb)-luma(S(uv-vec2(px.x,0.)).rgb); float gy=luma(S(uv+vec2(0.,px.y)).rgb)-luma(S(uv-vec2(0.,px.y)).rgb);
 float e=clamp(length(vec2(gx,gy))*5.,0.,1.); vec3 neon=hsv2rgb(vec3(fract(uT*uP.x*.1+uv.x*.5),.8,1.))*e*2.;
 return vec4(mix(S(uv).rgb*(1.-.35*uAmt),S(uv).rgb*.65,0.)+neon*uAmt,1.); }` },
  { id: 'sketch', name: 'Pencil Sketch', cat: 'Stylize', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec2 px=1.4/uRes; float c=luma(S(uv).rgb); float e=0.; for(int i=0;i<8;i++){ float a=float(i)*.7854; e+=abs(c-luma(S(uv+vec2(cos(a),sin(a))*px).rgb)); }
 float line=1.-clamp(e*1.6,0.,1.); float hatch=1.-.35*smoothstep(.5,.2,c)*(.5+.5*sin((uv.x+uv.y)*uRes.y*.5))-.25*smoothstep(.3,.05,c)*(.5+.5*sin((uv.x-uv.y)*uRes.y*.5));
 vec3 paper=vec3(.96,.94,.88)*(line*hatch); return vec4(mix(S(uv).rgb,paper,uAmt),1.); }` },
  { id: 'oilpaint', name: 'Oil Paint', cat: 'Stylize', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec2 px=2.2/uRes; vec3 best=S(uv).rgb; float bv=1e9; for(int k=0;k<4;k++){ vec2 o=vec2(k<2?-1.:1.,(k==0||k==2)?-1.:1.); vec3 m=vec3(0.); vec3 m2=vec3(0.);
  for(int i=0;i<4;i++){ for(int j=0;j<4;j++){ vec3 c=S(uv+(o*vec2(float(i),float(j)))*px).rgb; m+=c; m2+=c*c; } } m/=16.; vec3 v=m2/16.-m*m; float vs=v.r+v.g+v.b; if(vs<bv){ bv=vs; best=m; } }
 return vec4(mix(S(uv).rgb,best*1.05,uAmt),1.); }` },
  { id: 'jitter', name: 'Hand-held Jitter', cat: 'Motion', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ float t=uT*uP.x; vec2 d=vec2(noise(vec2(t*6.,1.))-.5,noise(vec2(t*6.,9.))-.5)*.014*uAmt; float r=(noise(vec2(t*5.,4.))-.5)*.012*uAmt;
 vec2 q=rot2(r)*((uv-.5)*vec2(aspect(),1.))/vec2(aspect(),1.)*(1.+.03*uAmt)+.5+d; return S(clamp(q,0.,1.)); }` },
  { id: 'spin', name: 'Spin & Zoom', cat: 'Motion', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ float t=uT*uP.x; float a=sin(t*.9)*.35*uAmt; float s=1.+.18*uAmt+.12*uAmt*sin(t*1.3); vec2 q=((rot2(a)*((uv-.5)*vec2(aspect(),1.)))/s)/vec2(aspect(),1.)+.5;
 return S(clamp(q,0.,1.)); }` },
  { id: 'shine', name: 'Shine Sweep', cat: 'Light', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec4 b=S(uv); float x=(uv.x+uv.y*.4)-fract(uT*uP.x*.3)*2.2+.3; float s=exp(-x*x*60.)*.9+exp(-(x+.08)*(x+.08)*240.)*.5;
 return vec4(b.rgb+vec3(1.,.95,.85)*s*uAmt*.7,b.a); }` },
  { id: 'flicker', name: 'Film Flicker', cat: 'Film', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ float t=floor(uT*uP.x*18.); float f=1.+(hash(t)-.5)*.35*uAmt+step(.93,hash(t*1.3))*.25*uAmt; vec3 c=S(uv).rgb*f;
 float scr=step(.995-.01*uAmt,hash21(vec2(floor(uv.x*uRes.x*.5),t)))*step(.5,hash(t+4.))*.0; float dust=smoothstep(.02,.0,length(uv-vec2(hash(t*2.),hash(t*3.))))*step(.7,hash(t*5.))*uAmt*.6;
 return vec4(c+dust+scr,1.); }` },
  { id: 'triple', name: 'Triple Screen', cat: 'Distort', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ float n=3.; vec2 u=vec2(fract(uv.x*n),uv.y); u.x=mix(uv.x,u.x,uAmt); float cell=floor(uv.x*n); u.y=mix(u.y,fract(u.y+(cell-1.)*.0),uAmt);
 vec3 c=S(vec2(clamp(.5+(u.x-.5)*(1./1.),0.,1.),u.y)).rgb; float line=smoothstep(.004,.0,abs(fract(uv.x*n)-.0))*uAmt; return vec4(mix(c,vec3(0.),line*.0),1.); }` },
  { id: 'glitchblocks', name: 'Block Glitch', cat: 'Glitch', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ float t=floor(uT*uP.x*8.); vec2 g=vec2(12.,20.); vec2 id=floor(uv*g); float r=hash21(id+t*3.7); float on=step(1.-uAmt*.28,r);
 vec2 off=(hash22(id+t)-.5)*.2*on; vec3 c=vec3(S(uv+off+vec2(.01,0.)*on).r,S(uv+off).g,S(uv+off-vec2(.01,0.)*on).b); c=mix(c,1.-c,step(.985,r)*on*.0+on*step(.9,hash21(id+t*9.))*.6); return vec4(c,1.); }` },
  { id: 'colorpop', name: 'Colour Pop', cat: 'Color', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec3 c=S(uv).rgb; float mx=max(c.r,max(c.g,c.b)); float mn=min(c.r,min(c.g,c.b)); float sat=(mx-mn)/(mx+1e-4); float keep=smoothstep(.28,.55,sat);
 vec3 g=vec3(luma(c)); vec3 o=mix(g,c*1.25,keep); return vec4(mix(c,o,uAmt),1.); }` },
  { id: 'gradmap', name: 'Gradient Map', cat: 'Color', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec3 c=S(uv).rgb; float l=luma(c); vec3 m=l<.5?mix(vec3(.08,.02,.25),vec3(.9,.15,.45),l*2.):mix(vec3(.9,.15,.45),vec3(1.,.9,.45),(l-.5)*2.); return vec4(mix(c,m,uAmt),1.); }` },
  { id: 'tiltshift', name: 'Tilt Shift', cat: 'Blur', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ float d=abs(uv.y-.5); float k=smoothstep(.12,.45,d)*uAmt; vec3 s=vec3(0.); float tot=0.; for(int i=0;i<12;i++){ float a=float(i)*2.39996; float r=sqrt(float(i)/12.)*.012*k*(1.+0.); s+=S(uv+vec2(cos(a),sin(a))*r*vec2(1./aspect(),1.)).rgb; tot+=1.; }
 vec3 c=s/tot; c=mix(c,c*vec3(1.08,1.02,.95),k*.3); return vec4(c*(1.+.1*uAmt*(1.-k)),1.); }` },
  { id: 'splittone', name: 'Split Tone', cat: 'Color', params: [INT, SPD(1)], glsl: `
vec4 effect(vec2 uv){ vec3 c=S(uv).rgb; float l=luma(c); vec3 sh=vec3(.0,.35,.5); vec3 hi=vec3(1.,.62,.3); vec3 t=mix(sh,hi,smoothstep(.2,.8,l)); vec3 o=c*(.6+.8*t); return vec4(mix(c,o,uAmt),1.); }` },
];

// ------------------------------------------------------------------ FILTERS
export const EXTRA_FILTERS = [
  { id: 'bleach', name: 'Bleach Bypass', cat: 'Film', look: L({ sat: .55, con: 1.3, bri: -.02, hi: [1, .98, .94], tint: .15, grain: .1, vig: .2 }) },
  { id: 'crossproc', name: 'Cross Process', cat: 'Retro', look: L({ sat: 1.25, con: 1.15, sh: [.05, .22, .1], hi: [1, .8, .35], tint: .55, gam: [.96, 1, 1.06] }) },
  { id: 'kodak', name: 'Kodak Warm', cat: 'Film', look: L({ sat: 1.15, con: 1.08, fade: .04, sh: [.1, .05, .02], hi: [1, .82, .52], tint: .4, grain: .08, vig: .12 }) },
  { id: 'fuji', name: 'Fuji Green', cat: 'Film', look: L({ sat: 1.05, con: 1.06, fade: .05, sh: [0, .14, .1], hi: [.88, 1, .85], tint: .35, gam: [.97, 1.02, .98], grain: .08 }) },
  { id: 'sunkiss', name: 'Sun Kissed', cat: 'Tone', look: L({ sat: 1.2, con: 1.02, bri: .05, hi: [1, .78, .5], sh: [.14, .06, .04], tint: .5, vig: .1 }) },
  { id: 'frost', name: 'Frost', cat: 'Tone', look: L({ sat: .85, con: 1.05, bri: .06, hi: [.82, .93, 1], sh: [.05, .16, .32], tint: .55 }) },
  { id: 'rosegold', name: 'Rose Gold', cat: 'Soft', look: L({ sat: 1.05, con: .96, bri: .05, fade: .06, hi: [1, .8, .78], sh: [.25, .1, .14], tint: .5 }) },
  { id: 'emerald', name: 'Emerald', cat: 'Stylized', look: L({ sat: 1.2, con: 1.1, sh: [0, .2, .14], hi: [.6, 1, .75], tint: .55, vig: .15 }) },
  { id: 'dusk', name: 'Dusk', cat: 'Stylized', look: L({ sat: 1.1, con: 1.12, bri: -.03, sh: [.15, .08, .3], hi: [1, .6, .5], tint: .55, vig: .25 }) },
];
