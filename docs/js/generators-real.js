// Realistic animated B-roll. Same format as generators.js (each body defines `vec3 gen(vec2 uv, vec2 p, float t)`), but built for
// a photographic look: atmospheric depth, lit glass, reflections, depth of field, film grain and a filmic tone curve.
// These are rendered live in the browser, so they cost nothing to store, work offline, and stay sharp at any resolution.
// Helpers from generators.js are available: hash, hash21, hash22, noise, fbm, rot2, luma, hsv2rgb, star, bokeh, PI, uRes, uT.

/** Shared helpers for every realistic scene. */
const REAL = `
float vignette(vec2 uv,float k){ vec2 q=uv-.5; return clamp(1.-k*dot(q,q)*2.4,0.,1.); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
// Filmic finish: exposure, tone curve, vignette, and fine grain that changes every frame.
vec3 finish(vec3 c,vec2 uv,float t,float ex,float vk,float grain){
 c=aces(c*ex); c*=vignette(uv,vk);
 float g=hash21(uv*vec2(1731.,1093.)+fract(t*7.13)*91.7)-.5; c+=g*grain*(1.-.5*luma(c));
 return c; }
float px(){ return 1./uRes.y; }
float sat01(float x){ return clamp(x,0.,1.); }
`;

/* ------------------------------------------------------------------------------------------------ city skyline family */
const SKYLINE = `
// One layer of a skyline: buildings with stepped crowns, spires, floors of lit windows and atmospheric haze.
vec4 bLayer(vec2 p,float t,float sc,float spd,float base,float hmax,float seed,float winH,vec3 fogC,float fog,float lit,float sunk){
 float x=p.x*sc+t*spd*sc+seed; float id=floor(x); float fx=fract(x);
 float h1=hash21(vec2(id,seed)), h2=hash21(vec2(id+7.3,seed)), h3=hash21(vec2(id+3.1,seed+2.));
 float m=.03+.15*h2;
 float H=hmax*(.16+.84*pow(h1,2.3)); if(h3>.88) H*=1.38;
 float yb=p.y-base;
 float crown=step(.6,h2)*step(H*.86,yb); float m2=m+crown*(.1+.12*h1);
 float aa=sc*px()*1.4;
 float inX=smoothstep(m2-aa,m2+aa,fx)*smoothstep(m2-aa,m2+aa,1.-fx);
 float inY=(1.-smoothstep(H-px(),H+px(),yb))*step(-.7,yb);
 float body=inX*inY;
 // spire on the tall ones
 float spH=step(.8,h3)*H*.16; float spire=step(abs(fx-.5)*1./sc,.0016)*step(H,yb)*step(yb,H+spH);
 float bx=(fx-m2)/max(.001,1.-2.*m2); float cols=max(2.,floor(((1.-2.*m2)/sc)/(winH*.62)));
 float wx=bx*cols; float wy=yb/(winH*(.9+.4*h2));
 vec2 cell=vec2(floor(wx),floor(wy)); vec2 f=vec2(fract(wx),fract(wy));
 float wm=smoothstep(.1,.22,f.x)*smoothstep(.9,.78,f.x)*smoothstep(.16,.28,f.y)*smoothstep(.86,.74,f.y);
 float rnd=hash21(cell+id*13.1+seed);
 float floorBias=mix(.2,1.,step(.28,hash21(vec2(cell.y,id+.5))));
 float on=smoothstep(1.-lit,1.-lit+.06,rnd+.16*sin(t*(.08+.2*h1)+rnd*60.))*floorBias;
 float warm=step(hash21(cell.yx+id),.62);
 vec3 wc=mix(vec3(.72,.86,1.),vec3(1.,.72,.36),warm)*(.55+.95*hash21(cell+id*3.7));
 float vis=smoothstep(1.2,4.5,winH*(.9+.4*h2)/px());
 float wg=smoothstep(-.45,.12,f.x)*smoothstep(1.45,.88,f.x)*smoothstep(-.4,.15,f.y)*smoothstep(1.4,.85,f.y);                 // fade to an average when windows get sub-pixel
 float winMask=wm*vis+(1.-vis)*.35;
 vec3 glass=mix(vec3(.011,.016,.028),fogC*.55,fog);
 float facade=.82+.36*noise(vec2(bx*22.,yb*40.+id));
 vec3 col=glass*facade;
 col+=fogC*(.34*exp(-max(yb,0.)*7.))*(1.-fog*.5);                      // light from the streets bleeds up the facade
 col+=fogC*.2*smoothstep(.08,0.,min(fx-m2,1.-m2-fx))*step(.0,yb);      // soft edge light
 col+=sunk*vec3(1.,.62,.32)*smoothstep(.35,.75,bx)*(.2+.5*h1)*.55;          // low sun catches the glass on one side
 col+=wc*on*(winMask*1.25+wg*.16*vis)*(1.-fog*.65)*(inY);
 // aircraft warning beacon
 float bl=pow(.5+.5*sin(t*2.6+h1*30.),3.);
 vec2 bd=vec2((fx-.5)/sc,yb-H-spH);
 float beacon=step(.8,h3)*bl*exp(-length(bd)*420.);
 col+=vec3(1.,.12,.08)*beacon*2.;
 float a=max(body,spire*.9);
 return vec4(col,max(a,clamp(beacon,0.,1.)));
}
vec3 citySky(vec2 p,float t,vec3 sT,vec3 sM,vec3 sH,vec3 glow,float stars,float sun,float horizon){
 float h=clamp((p.y-horizon)/(.5-horizon),0.,1.);
 vec3 c=mix(sH,sM,smoothstep(0.,.38,h)); c=mix(c,sT,smoothstep(.25,1.,h));
 c+=vec3(star(p+vec2(10.),t,48.))*stars*smoothstep(.12,.5,h);
 vec2 sp=vec2(.16,horizon+.07);
 float sd=length(p-sp);
 c+=glow*exp(-sd*3.2)*sun+vec3(1.,.9,.72)*exp(-sd*22.)*sun*1.5+vec3(1.,.96,.88)*smoothstep(.028,.018,sd)*sun*4.;
 // slow cloud deck, lit from underneath by the city or the sun
 vec2 cq=vec2(p.x*1.25+t*.012,p.y*3.4);
 float cl=smoothstep(.44,.84,fbm(cq*1.6)*.62+.45*fbm(cq*3.+t*.02));
 float band=smoothstep(horizon,horizon+.14,p.y)*(1.-smoothstep(.2,.5,p.y));
 vec3 under=mix(sM*.8,sH*1.5,exp(-max(p.y-horizon,0.)*5.));
 c=mix(c,under*(.6+.5*fbm(cq*5.)),cl*band*.82);
 return c;
}
vec3 cityCore(vec2 p,float t,vec3 sT,vec3 sM,vec3 sH,vec3 glow,vec3 fogC,float lit,float stars,float sun,float wl){
 vec3 c=citySky(p,t,sT,sM,sH,glow,stars,sun,wl);
 vec4 L;
 L=bLayer(p,t,30.,.0035,wl,.26,3.1,.0052,fogC,.80,lit,sun); c=mix(c,L.rgb,L.a);
 L=bLayer(p,t,17.,.0085,wl,.38,11.7,.0072,fogC,.55,lit,sun); c=mix(c,L.rgb,L.a);
 L=bLayer(p,t,9.5,.0170,wl,.52,29.3,.0105,fogC,.22,lit,sun); c=mix(c,L.rgb,L.a);
 // sea-level haze where the city meets the water
 c=mix(c,fogC*1.1,exp(-max(p.y-wl,0.)*16.)*.22);
 return c;
}
vec3 cityShot(vec2 uv,vec2 p,float t,vec3 sT,vec3 sM,vec3 sH,vec3 glow,vec3 fogC,vec3 sea,float lit,float stars,float sun,float ex){
 float wl=-.19;
 // gentle push-in
 vec2 q=p*(1.-.035*sin(t*.07)); q.y+=.02;
 vec3 c;
 if(q.y>=wl){ c=cityCore(q,t,sT,sM,sH,glow,fogC,lit,stars,sun,wl); }
 else{
  float d=wl-q.y;
  vec3 acc=vec3(0.);
  for(int i=0;i<6;i++){
   float fi=float(i);
   float w=sin(d*38.+t*.8+fi*1.3)*.0016*(1.+d*9.)+(noise(vec2(q.x*7.+fi*9.,d*40.+t*.5))-.5)*.008*(1.+d*5.);
   vec2 r=vec2(q.x+w,wl+d*.9+fi*.006*(1.+d*3.));
   acc+=cityCore(r,t,sT,sM,sH,glow,fogC,lit,stars,sun,wl);
  }
  acc/=6.;
  float fres=exp(-d*4.2);
  c=mix(sea*(1.-d*1.4),acc*vec3(.62,.72,.9),clamp(fres*.92,0.,1.));
  float spark=pow(noise(vec2(q.x*90.,q.y*420.+t*1.4)),11.)*exp(-d*5.)*sun*1.6;
  c+=vec3(1.,.8,.55)*spark;
 }
 return finish(c,uv,t,ex,.55,.045);
}
`;

/* ------------------------------------------------------------------------------------------------ the scenes */
const G = (id, name, genre, glsl) => ({ id, name, genre, glsl, real: true });

export const REAL_GENERATORS = [
  G('skylinenight', 'Skyline · Night', 'city', `${REAL}${SKYLINE}
vec3 gen(vec2 uv,vec2 p,float t){
 return cityShot(uv,p,t,vec3(.008,.016,.05),vec3(.03,.05,.12),vec3(.2,.13,.2),vec3(.9,.4,.3),vec3(.3,.22,.3),vec3(.004,.008,.02),.6,.7,0.,1.15); }`),
  G('skylinegolden', 'Skyline · Golden Hour', 'city', `${REAL}${SKYLINE}
vec3 gen(vec2 uv,vec2 p,float t){
 return cityShot(uv,p,t,vec3(.08,.17,.4),vec3(.5,.38,.45),vec3(1.,.55,.22),vec3(1.,.5,.2),vec3(.62,.34,.24),vec3(.04,.06,.09),.05,0.,1.,.8); }`),
  G('skylineblue', 'Skyline · Blue Hour', 'city', `${REAL}${SKYLINE}
vec3 gen(vec2 uv,vec2 p,float t){
 return cityShot(uv,p,t,vec3(.02,.05,.15),vec3(.09,.17,.36),vec3(.62,.5,.62),vec3(.6,.45,.7),vec3(.32,.36,.58),vec3(.012,.024,.05),.42,.15,0.,1.1); }`),

  /* ------------------------------------------------------------------ money & finance */
  G('moneyrain', 'Cash Rain', 'finance', `${REAL}
// A generic banknote (original ornament, no real currency): frame, guilloche rings, portrait oval, corner blocks.
vec3 notePattern(vec2 q,float seed){
 float u=q.x,v=q.y;
 vec3 paper=mix(vec3(.40,.62,.38),vec3(.66,.84,.55),fbm(q*5.+seed));
 float r=max(abs(u),abs(v)*1.15);
 float frame=smoothstep(.03,0.,abs(r-.9))+smoothstep(.022,0.,abs(r-.78))*.8;
 float d=length(vec2(u*.62,v)); float ang=atan(v,u*.62);
 float guil=.5+.5*sin(d*95.+3.5*sin(ang*7.+seed)+4.*sin(u*8.));
 vec3 c=paper*(.8+.3*guil*step(d,.72));
 c=mix(c,vec3(.07,.2,.11),frame*.85);
 float oval=length(vec2(u*1.45,v*.95));
 c=mix(c,mix(vec3(.12,.28,.17),vec3(.5,.66,.44),smoothstep(.0,.5,oval)),smoothstep(.34,.3,oval)*.92);
 float head=smoothstep(.12,.1,length(vec2(u*1.5,(v-.08)*1.1))); float shoulders=smoothstep(.2,.17,length(vec2(u*1.2,(v+.34)*2.))); c=mix(c,vec3(.06,.16,.1),max(head,shoulders)*smoothstep(.34,.3,oval));
 vec2 cp=abs(vec2(u,v))-vec2(.7,.52); float corner=smoothstep(.02,0.,max(abs(cp.x)-.1,abs(cp.y)-.14)); c=mix(c,vec3(.06,.18,.1),corner*.9);
 c*=.94+.06*sin(v*160.+seed);
 return c; }
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.003,.012,.01),vec3(.03,.1,.07),exp(-length(p-vec2(.0,.12))*1.7));
 col+=vec3(.55,1.,.75)*pow(max(0.,1.-abs(p.x*2.+p.y*.9-.1)),6.)*.07*(.6+.4*sin(t*.4));
 for(int L=0;L<4;L++){
  float fl=float(L); float sc=mix(8.,3.4,fl/3.);
  float blur=abs(fl-1.5)/1.5;
  vec2 g=vec2(p.x*sc+fl*3.1,p.y*sc*.7);
  float cx=floor(g.x); float hc=hash21(vec2(cx,fl+5.));
  float spd=(.6+.35*fl)*(.75+.5*hc);
  float yy=g.y+t*spd+hc*20.; float cy=floor(yy);
  vec2 id=vec2(cx,cy)+fl*17.;
  float n1=hash21(id), n2=hash21(id+3.7), n3=hash21(id+9.1);
  if(n1<.3) continue;
  vec2 f=vec2(fract(g.x)-.5,fract(yy)-.5);
  f.x+=(n2-.5)*.2; f.y+=(n3-.5)*.3;
  float rz=(n2-.5)*2.4+sin(t*(.5+n1)+n3*20.)*.6;
  float fa=t*(.7+1.1*n3)+n1*30.; float cf=cos(fa);
  vec2 q=rot2(rz)*f;
  float hw=.4, hh=.19;
  q=vec2(q.x/hw,q.y/(hh*max(abs(cf),.05)));
  float edge=.025+.16*blur*blur;
  float inside=smoothstep(1.+edge,1.-edge,max(abs(q.x),abs(q.y)));
  if(inside<=.001) continue;
  vec3 n=notePattern(q,n1*10.);
  vec3 back=vec3(.3,.45,.3)*(.85+.3*fbm(q*3.));
  n=mix(back,n,step(0.,cf));
  float light=.42+.7*abs(cf);
  n*=light; n+=pow(abs(cf),20.)*.3*vec3(1.,1.,.85)*smoothstep(.5,-.5,q.y+q.x*.4);
  n=mix(n,vec3(.05,.13,.09),blur*.55);
  col=mix(col,n,inside*(1.-.2*blur));
 }
 return finish(col,uv,t,1.3,.5,.05); }`),
  G('liquidgold', 'Liquid Gold', 'finance', `${REAL}
float hgt(vec2 p,float t){
 vec2 w=vec2(fbm(p*.7+vec2(t*.04,0.)),fbm(p*.7+vec2(4.3,t*.035)));
 return fbm(p*.9+w*1.9+vec2(0.,t*.025)); }
vec3 env(vec3 r){
 float a=smoothstep(.28,.0,abs(r.x*.8+r.y*.45-.2));
 float b=smoothstep(.2,.0,abs(r.y-.45))*smoothstep(1.2,.1,abs(r.x));
 float k=smoothstep(.34,.0,abs(r.x*-.6+r.y*.3+.5));
 return vec3(.26,.17,.08)+vec3(1.,.9,.7)*(a*1.5+b*1.0+k*.9); }
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*1.5; float e=.006;
 float h=hgt(q,t);
 float dx=(hgt(q+vec2(e,0.),t)-hgt(q-vec2(e,0.),t))/(2.*e), dy=(hgt(q+vec2(0.,e),t)-hgt(q-vec2(0.,e),t))/(2.*e);
 vec3 n=normalize(vec3(-dx*.55,-dy*.55,1.));
 vec3 r=reflect(vec3(0.,0.,-1.),n);
 vec3 gold=vec3(1.,.72,.28);
 vec3 c=gold*env(r)*vec3(1.,.9,.72);
 c+=vec3(1.,.9,.7)*pow(max(0.,dot(r,normalize(vec3(.4,.5,.75)))),80.)*.9;
 c*=.6+.6*smoothstep(.15,.85,h);
 return finish(c,uv,t,1.0,.6,.03); }`),
  G('candles', 'Market Candles', 'finance', `${REAL}
float pr(float x){ return .9*sin(x*.11+1.)+.55*sin(x*.043+4.)+.3*sin(x*.29)+(noise(vec2(x*.45,3.1))-.5)*1.1+x*.012; }
vec3 gen(vec2 uv,vec2 p,float t){
 float K=60.; float sp=3.6;
 float X0=t*sp*.5+60.;
 float Xc=p.x*K*.5+X0;
 float Sy=2.0;
 float yc=pr(floor(X0))*.55+pr(floor(X0)+14.)*.45;
 float Y=p.y*Sy+yc;
 vec3 col=mix(vec3(.01,.022,.03),vec3(.02,.05,.07),smoothstep(-.5,.5,p.y))+vec3(.02,.1,.12)*exp(-length(p)*1.8)*.6;
 // grid
 float gx=smoothstep(.04,0.,abs(fract(Xc/6.)-.5)*0.+abs(fract(Xc/6.+.5)-.5)*2.-.96); 
 float gy=smoothstep(.012,0.,abs(fract(Y*1.7)-.5)-.488);
 col+=vec3(.12,.2,.24)*(gx*.1+gy*.12);
 // moving average
 float ma=0.; for(int k=0;k<6;k++) ma+=pr(Xc-float(k)*1.6); ma/=6.;
 float dma=abs(Y-ma)/Sy; col+=vec3(.95,.72,.25)*(exp(-dma*260.)*.9+exp(-dma*55.)*.14);
 // candles
 float base=floor(Xc);
 for(int k=-1;k<=1;k++){
  float i=base+float(k); float fx=Xc-i-.5;
  float o=pr(i)+(hash(i*3.1)-.5)*.2, c=pr(i+1.)+(hash(i*7.7)-.5)*.3;
  float hi=max(o,c)+hash(i*1.7)*.28, lo=min(o,c)-hash(i*5.3)*.28;
  float up=step(o,c); vec3 cc=mix(vec3(.96,.24,.3),vec3(.12,.86,.62),up);
  float bw=.34;
  vec2 d=vec2(max(abs(fx)-bw,0.)/K*2.,max(max(Y-max(o,c),min(o,c)-Y),0.)/Sy);
  float body=smoothstep(.0035,0.,length(d)-.0);
  float dw=vec2(max(abs(fx)-.03,0.)/K*2.,max(max(Y-hi,lo-Y),0.)/Sy).x;
  vec2 d2=vec2(max(abs(fx)-.035,0.)/K*2.,max(max(Y-hi,lo-Y),0.)/Sy); float wick=smoothstep(.003,0.,length(d2));
  float glow=exp(-length(d)*70.)*.28+exp(-length(d2)*90.)*.1;
  float shade=.8+.35*smoothstep(-bw,bw,fx)*up+.2*(1.-up)*smoothstep(bw,-bw,fx);
  col=mix(col,cc*shade,max(body,wick*.9));
  col+=cc*glow;
 }
 // volume bars along the bottom
 float vi=floor(Xc); float vh=.05+.12*hash(vi*2.9+4.)+.04*step(.8,hash(vi*1.3));
 float vb=smoothstep(.003,0.,abs(fract(Xc)-.5)-.36)*step(p.y+.5,vh);
 col=mix(col,vec3(.14,.34,.38),vb*.65*smoothstep(.5,-.45,p.y));
 // last-price line
 float lp=pr(floor(Xc)+1.); float dl=abs(Y-lp)/Sy; col+=vec3(.5,.9,.8)*exp(-dl*320.)*.1*step(.0,p.x);
 return finish(col,uv,t,1.25,.55,.04); }`),
  /* ------------------------------------------------------------------ night city, rain, road */
  G('rainwindow', 'Rain on Glass', 'city', `${REAL}
// Night lights out of focus. sharp=0: big soft discs (fogged glass); sharp=1: smaller, crisper points (seen through a droplet).
vec3 cityBokeh(vec2 p,float t,float sharp){
 vec3 c=mix(vec3(.012,.016,.04),vec3(.08,.055,.1),smoothstep(-.4,.4,p.y));
 c+=vec3(.55,.3,.2)*.1*exp(-max(p.y+.5,0.)*2.);
 for(int L=0;L<4;L++){
  float fl=float(L); float sc=mix(3.4,7.,fl/3.)*mix(.75,1.5,sharp);
  vec2 q=p*sc+vec2(fl*5.3,fl*2.1+t*.008*(fl+1.)); vec2 id=floor(q); vec2 f=fract(q)-.5;
  vec2 off=(hash22(id+fl*11.)-.5)*.34; float r=(.1+.17*hash21(id+3.3+fl));
  float on=step(.3,hash21(id+9.1+fl*7.)); float d=length(f-off);
  float soft=mix(.2,.05,sharp);
  float disc=smoothstep(r,r-soft,d)*(.6+.4*smoothstep(r-.14,r,d));
  float tw=.8+.2*sin(t*(.5+hash21(id)*2.)+hash21(id)*30.);
  vec3 hue=mix(vec3(1.,.64,.3),vec3(.55,.8,1.),step(.55,hash21(id+1.7)));
  hue=mix(hue,vec3(1.,.25,.3),step(.88,hash21(id+5.5)));
  hue=mix(hue,vec3(1.),step(.93,hash21(id+2.2)));
  float low=smoothstep(.55,-.35,p.y)*.7+.55;
  c+=hue*disc*on*tw*(1.-.1*fl)*low*1.1;
 }
 return c; }
vec3 drops(vec2 uv,vec2 asp,float t,float sc,float seed){
 vec2 st=uv*asp*sc; vec2 id=floor(st); vec2 f=fract(st)-.5;
 float n=hash21(id+seed); float n2=hash21(id+seed+4.1); float n3=hash21(id+seed+8.7);
 float period=7.+9.*n; float ph=fract(t/period+n2);
 float grow=smoothstep(0.,.1,ph);
 float slide=smoothstep(.66+.2*n3,1.,ph);
 float ypos=-slide*slide*1.5*(.6+.6*n);
 vec2 c=vec2((n3-.5)*.3,ypos*.4);
 float r=(.15+.14*n)*grow*(1.-smoothstep(.96,1.,ph));
 vec2 d=(f-c)*vec2(1.,.8);
 float m=smoothstep(r,r*.82,length(d));
 float trail=smoothstep(.016+.01*n,0.,abs(f.x-c.x))*step(f.y,.5)*step(c.y,f.y)*step(.5,n)*slide*.6;
 vec2 nrm=-(f-c)/max(r,.02)*m;
 return vec3(nrm,max(m,trail)); }
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 asp=vec2(uRes.x/uRes.y,1.);
 vec2 off=vec2(0.); float mask=0.;
 for(int L=0;L<3;L++){ float fl=float(L); vec3 dr=drops(uv,asp,t,mix(3.6,8.,fl/2.),fl*13.7); off+=dr.xy*mix(.07,.035,fl/2.); mask=max(mask,dr.z); }
 vec3 fog=cityBokeh(p,t,0.)*.85+vec3(.015,.02,.028);
 vec3 thru=cityBokeh(p+off,t,.35);
 vec3 col=mix(fog,thru*1.2,clamp(mask,0.,1.));
 col+=vec3(.7,.8,1.)*pow(clamp(mask,0.,1.),8.)*.04;
 return finish(col,uv,t,1.4,.55,.045); }`),
  G('nighthighway', 'Night Highway', 'city', `${REAL}${SKYLINE}
vec3 gen(vec2 uv,vec2 p,float t){
 float hy=.06;
 vec3 sT=vec3(.01,.015,.045),sM=vec3(.05,.045,.1),sH=vec3(.35,.2,.22);
 vec3 c=citySky(p,t,sT,sM,sH,vec3(.9,.4,.3),.5,0.,hy);
 vec4 L=bLayer(p,t,26.,.004,hy,.14,5.5,.0042,vec3(.35,.24,.3),.78,.55,0.); c=mix(c,L.rgb,L.a);
 L=bLayer(p,t,15.,.009,hy,.19,17.2,.0058,vec3(.3,.22,.3),.5,.5,0.); c=mix(c,L.rgb,L.a);
 if(p.y<hy){
  float dy=hy-p.y; float z=1./max(dy,.003);
  float wx=p.x/dy;
  vec3 road=vec3(.016,.017,.024)*(.85+.3*noise(vec2(wx*5.,z*1.2-t*2.)));
  road+=vec3(.55,.28,.22)*exp(-dy*10.)*.12;
  c=road;
  // barrier on each side
  float edge=abs(wx)-3.3; c=mix(c,vec3(.012,.012,.018)+vec3(.2,.1,.08)*exp(-dy*14.)*.3,smoothstep(0.,.06,edge));
  // dashed lane lines, in perspective
  for(int k=-2;k<=2;k++){
   float lx=float(k)*1.1+.0; if(k==0) continue;
   float dl=abs(wx-lx); float dash=step(.55,fract(z*.35-t*2.2));
   c+=vec3(.75,.72,.62)*smoothstep(.07*(1.+0.),0.,dl)*dash*.12*smoothstep(.0,.05,dy);
  }
  c+=vec3(.9,.8,.5)*smoothstep(.06,0.,abs(wx))*.06;                       // centre line
  // light trails: white heading toward us on the left, red heading away on the right
  for(int k=0;k<8;k++){
   float fk=float(k); float side=fk<4.?-1.:1.; float lane=mod(fk,4.);
   float lx=side*(.35+lane*.7)+(side>0.?.0:.0);
   float dist=abs(wx-lx)*dy;                                  // screen-space distance
   float sp=side<0.?5.5:-3.4;
   float pulse=smoothstep(.34,.85,noise(vec2(z*.5+t*sp*.22,fk*7.3)))+.45*smoothstep(.55,.95,noise(vec2(z*1.5+t*sp*.55,fk*3.1)));
   vec3 lc=side<0.?vec3(1.,.9,.7):vec3(1.,.1,.06);
   float core=exp(-dist*(180.+z*8.));
   c+=lc*core*pulse*(2.2-1.4*smoothstep(0.,30.,z));
   c+=lc*exp(-dist*(22.+z*1.))*pulse*.12;
   c+=lc*exp(-dist*60.)*pulse*.04*smoothstep(0.,.2,dy);            // wet-road sheen
  }
 }
 vec3 bk; float b=bokeh(p+vec2(t*.01,0.),t*.2,6.,.0,3.,bk); c+=bk*b*.1*smoothstep(.0,-.4,p.y);
 return finish(c,uv,t,1.3,.6,.04); }`),
  /* ------------------------------------------------------------------ nature, space, atmosphere */
  G('earthorbit', 'Earth from Orbit', 'space', `${REAL}
// triplanar noise on the sphere, so continents and clouds never pinch at the poles or the limb
float tri(vec3 q,float f,float seed){
 vec3 w=pow(abs(q),vec3(4.)); w/=w.x+w.y+w.z;
 return fbm(q.yz*f+seed)*w.x+fbm(q.xz*f+seed+3.1)*w.y+fbm(q.xy*f+seed+6.2)*w.z; }
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.002,.003,.008)+vec3(star(p+vec2(3.),t,60.))*.8+vec3(star(p*1.7+vec2(9.),t,95.))*.4;
 float asp=uRes.x/uRes.y; float R=min(.36,asp*.4);
 vec2 d=p; float r=length(d);
 vec3 L=normalize(vec3(-.85,.3,.42));
 float atm=exp(-max(r-R,0.)*26.)*smoothstep(R*1.3,R,r);
 if(r<R){
  float z=sqrt(R*R-r*r); vec3 n=normalize(vec3(d,z));
  float a=t*.045; vec3 nr=vec3(n.x*cos(a)+n.z*sin(a),n.y,-n.x*sin(a)+n.z*cos(a));
  float cont=tri(nr,2.2,1.)+.28*tri(nr,6.,4.);
  float land=smoothstep(.56,.6,cont);
  float lat=abs(nr.y);
  float ice=smoothstep(.8,.93,lat+(tri(nr,5.,8.)-.5)*.2);
  vec3 ocean=mix(vec3(.005,.03,.1),vec3(.02,.1,.26),tri(nr,3.,2.));
  vec3 ground=mix(vec3(.1,.26,.07),vec3(.6,.47,.27),smoothstep(.3,.75,tri(nr,3.,9.)+(.5-lat)*.0));
  ground=mix(ground,vec3(.7,.6,.4),smoothstep(.3,.0,lat)*smoothstep(.45,.65,tri(nr,2.,12.))*.8);
  vec3 surf=mix(ocean,ground,land); surf=mix(surf,vec3(.9,.93,.97),ice);
  float cl=smoothstep(.52,.78,tri(vec3(nr.x+t*.004,nr.y,nr.z),3.2,3.)*1.05)*.9;
  float dif=dot(n,L); float day=smoothstep(-.1,.3,dif);
  vec3 lit=surf*(.06+1.3*max(dif,0.))+vec3(1.)*cl*(.08+1.15*max(dif,0.));
  vec3 H=normalize(L+vec3(0.,0.,1.)); float spec=pow(max(dot(n,H),0.),90.)*(1.-land)*(1.-cl)*.9;
  lit+=vec3(1.,.95,.85)*spec;
  float lights=pow(tri(nr,18.,5.),3.6)*land*(1.-day)*(1.-ice)*(1.-cl*.7)*9.;
  vec3 night=surf*.012+vec3(1.,.72,.38)*lights+cl*vec3(.01,.012,.02);
  col=mix(night,lit,day);
  float fres=pow(1.-n.z,3.);
  col+=vec3(.2,.45,1.)*fres*(.08+.6*smoothstep(-.3,.6,dif));
 }
 col+=vec3(.25,.5,1.)*atm*(.07+.5*smoothstep(-.5,.7,dot(normalize(vec3(d,.25)),L)));
 return finish(col,uv,t,1.2,.45,.03); }`),
  G('cloudtime', 'Cloud Timelapse', 'nature', `${REAL}
vec3 gen(vec2 uv,vec2 p,float t){
 float hz=-.3;
 vec2 sunp=vec2(.32,.38);
 vec3 sky=mix(vec3(.5,.72,.98),vec3(.04,.2,.6),smoothstep(-.3,.55,p.y));
 sky=mix(sky,vec3(.85,.88,.92),exp(-max(p.y-hz,0.)*6.)*.3);
 float sd=length(p-sunp);
 sky+=vec3(1.,.9,.72)*exp(-sd*2.6)*.35+vec3(1.,.95,.85)*exp(-sd*18.)*.5;
 vec3 col=sky;
 if(p.y>hz-.05){
  float z=1./(p.y-hz+.14);
  vec2 cq=vec2(p.x*z*.85+t*.035,z*1.15+t*.05);
  float d0=fbm(cq)*1.15+.2*fbm(cq*3.1+7.);
  float d1=fbm(cq+vec2(.06,.05))*1.15+.2*fbm((cq+vec2(.06,.05))*3.1+7.);
  float cover=smoothstep(.4,.72,d0);
  float lit=clamp(.62+(d0-d1)*9.,0.,1.2);
  vec3 shade=vec3(.46,.54,.68),bright=vec3(1.,.985,.95);
  vec3 cc=mix(shade,bright,lit);
  cc+=vec3(1.,.8,.5)*pow(clamp((d0-d1)*10.,0.,1.),2.)*exp(-sd*1.2)*.5;      // sun-lit rims
  cc=mix(cc,vec3(.86,.89,.94),smoothstep(4.,10.,z)*.55);                       // haze toward the horizon
  col=mix(col,cc,cover*smoothstep(hz-.05,hz+.12,p.y));
 }
 return finish(col,uv,t,1.0,.5,.025); }`),
  G('smokewisp', 'Silk Smoke', 'cinema', `${REAL}
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*1.15; q.y-=t*.07;
 vec2 w=vec2(fbm(q*1.2+vec2(0.,t*.05)),fbm(q*1.2+vec2(5.2,-t*.04)));
 float s=fbm(q*.95+w*2.6);
 float s2=fbm(q*2.1+w*3.0+vec2(t*.03,0.));
 float dens=smoothstep(.2,.78,s)*.95+smoothstep(.35,.85,s2)*.4;
 float lightA=.5+.5*smoothstep(-.5,.5,p.x*.7+p.y*.5);
 vec3 col=vec3(.012,.014,.02)+vec3(.8,.85,.95)*dens*lightA*.9;
 col+=vec3(1.,.78,.5)*pow(clamp(dens,0.,1.),3.)*.14*smoothstep(.2,-.3,p.y);
 return finish(col,uv,t,1.15,.6,.035); }`),
];
