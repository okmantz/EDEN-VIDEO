// More animated B-roll scenes. Same format as generators.js: each body defines `vec3 gen(vec2 uv, vec2 p, float t)`,
// where uv is 0..1, p is centred and aspect-corrected (y runs -0.5..0.5) and t is seconds.
// Helpers available from generators.js: hash, hash21, hash22, noise, fbm, rot2, luma, hsv2rgb, star, bokeh, skyGrad, ridge, PI.
const G = (id, name, genre, glsl) => ({ id, name, genre, glsl });

export const EXTRA_GENERATORS = [
  // ------------------------------------------------------------ NATURE
  G('underwater', 'Underwater Light', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.0,.05,.16),vec3(.0,.36,.46),uv.y);
 vec2 q=p*3.2; float c=0.;
 for(int i=0;i<3;i++){ float fi=float(i); q=rot2(.6)*q*1.35+vec2(t*.12*(1.+fi*.3),fi*2.1);
  c+=pow(abs(sin(q.x*2.+sin(q.y*2.+t*.5))*sin(q.y*2.-cos(q.x*2.-t*.4))),.6)*.5; }
 col+=vec3(.2,.75,.8)*c*.2*smoothstep(.1,1.,uv.y);
 float ray=0.;
 for(int i=0;i<4;i++){ float fi=float(i); float x=p.x+(uv.y-.5)*(.5+fi*.2)+fi*.37+.1*sin(t*.2+fi); ray+=pow(max(0.,sin(x*4.+fi*2.)),6.)*.5; }
 col+=vec3(.55,.95,1.)*ray*.2*smoothstep(.2,1.,uv.y);
 vec3 bk;
 for(int i=0;i<2;i++){ float b=bokeh(p,t*.5,6.+float(i)*4.,.09+float(i)*.05,float(i)*7.,bk); col+=vec3(.7,.95,1.)*b*.3; }
 return col; }`),
  G('autumn', 'Autumn Leaves', 'nature', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.95,.62,.28),vec3(.35,.14,.08),1.-uv.y)*.6+vec3(.1,.04,.0);
 col+=vec3(1.,.8,.5)*exp(-length(p-vec2(.25,.3))*3.)*.35;
 for(int L=0;L<3;L++){ float fl=float(L); float sc=6.+fl*4.;
  vec2 q=p*sc; q.y+=t*(.6+fl*.35); q.x+=sin(q.y*.7+fl*3.+t*.5)*.6; vec2 id=floor(q); vec2 f=fract(q)-.5;
  float h=hash21(id+fl*13.); vec2 off=(hash22(id+fl*5.)-.5)*.5; vec2 d=rot2(h*6.283+t*(.5+h))*(f-off);
  float leaf=smoothstep(.2,.17,length(d*vec2(1.,2.1)))*step(.55,hash21(id+fl*3.));
  vec3 lc=mix(vec3(.9,.2,.05),vec3(1.,.75,.1),hash21(id+9.)); col=mix(col,lc*(.55+.12*fl),leaf*(.9-fl*.15)); }
 return col; }`),

  // ------------------------------------------------------------ CITY
  G('skyline', 'Dusk Skyline', 'city', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=skyGrad(uv.y,vec3(1.,.5,.35),vec3(.55,.25,.5),vec3(.05,.06,.22));
 col+=vec3(star(p+vec2(3.),t,40.))*smoothstep(.6,.95,uv.y)*.7;
 col+=vec3(1.,.6,.3)*exp(-length(vec2(p.x*.8,uv.y-.38))*4.)*.4;
 for(int L=0;L<3;L++){ float fl=float(L); float sc=6.+fl*5.;
  float x=p.x*sc+t*(.01+fl*.015)*sc+fl*10.; float id=floor(x);
  float top=.3+(.18+.22*hash(id+fl*31.))*(1.-fl*.18)-fl*.02;
  float inb=step(abs(fract(x)-.5),.44)*step(uv.y,top);
  vec3 bc=mix(vec3(.2,.14,.32),vec3(.035,.03,.1),fl*.5);
  col=mix(col,bc,inb);
  float wid=hash21(vec2(floor(x*5.),floor(uv.y*60.))+fl*17.);
  float lit=step(.62,wid)*(.6+.4*sin(t*(.5+wid*2.)+wid*30.));
  vec2 w=vec2(fract(x*5.)-.5,fract(uv.y*60.)-.5); float wbox=step(abs(w.x),.28)*step(abs(w.y),.3);
  col+=inb*wbox*lit*vec3(1.,.8,.45)*(.55-fl*.1)*step(uv.y,top-.012); }
 return col; }`),

  // ------------------------------------------------------------ TECH
  G('hexgrid', 'Hex Grid', 'tech', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=p*7.; vec2 r=vec2(1.,1.7320508); vec2 h2=r*.5;
 vec2 a=mod(q,r)-h2; vec2 b=mod(q-h2,r)-h2; vec2 gv=dot(a,a)<dot(b,b)?a:b; vec2 id=q-gv;
 vec2 ag=abs(gv); float e=max(ag.x,dot(ag,normalize(vec2(1.,1.7320508))));
 float edge=smoothstep(.45,.5,e);
 float ph=hash21(floor(id*3.)); float pulse=.5+.5*sin(t*1.4+ph*6.283+length(id)*.5);
 vec3 col=vec3(.02,.04,.09)+vec3(.05,.35,.6)*pulse*pulse*.4*(1.-edge);
 col+=vec3(.2,.9,1.)*edge*(.25+.6*pulse);
 float sw=exp(-pow((uv.y-fract(t*.18))*6.,2.));
 col+=vec3(.2,.6,1.)*sw*.12*(1.-edge)+vec3(.6,1.,1.)*sw*edge*.4;
 return col; }`),
  G('radar', 'Radar Sweep', 'tech', `
vec3 gen(vec2 uv,vec2 p,float t){
 float r=length(p); float a=atan(p.y,p.x);
 vec3 col=vec3(.0,.035,.03)+vec3(.0,.12,.08)*(1.-r*1.6);
 float rd=min(fract(r*4.),1.-fract(r*4.)); col+=vec3(.0,.8,.45)*smoothstep(.02,.004,rd)*.5*step(r,.5);
 col+=vec3(.0,.8,.45)*(smoothstep(.003,.0,abs(p.x))+smoothstep(.003,.0,abs(p.y)))*.4*step(r,.5);
 float bt=fract(t*.25)*6.2831853-3.1415926;
 float d=mod(bt-a,6.2831853)/6.2831853;
 col+=vec3(.1,1.,.55)*exp(-d*7.)*step(r,.48)*.85;
 col+=vec3(.2,1.,.6)*smoothstep(.012,.0,abs(r-.48))*.5;
 for(int i=0;i<6;i++){ float fi=float(i); float ai=(hash(fi*3.7)*2.-1.)*3.1415926; float ri=.08+.36*hash(fi*9.1);
  vec2 bp=vec2(cos(ai),sin(ai))*ri; float da=mod(bt-ai,6.2831853)/6.2831853;
  col+=vec3(.5,1.,.7)*exp(-length(p-bp)*90.)*exp(-da*4.); }
 return col; }`),

  // ------------------------------------------------------------ SPACE
  G('blackhole', 'Black Hole', 'space', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.005,.005,.015)+vec3(star(p*2.+3.,t,60.))*.8+vec3(star(p*3.5+9.,t,80.))*.5;
 vec2 q=p*vec2(1.,2.1); float r=length(q); float a=atan(q.y,q.x);
 float disk=smoothstep(.36,.22,r)*smoothstep(.1,.2,r);
 float sw=fbm(vec2(a*2.+t*.6+r*9.,r*14.-t*.9));
 vec3 dc=mix(vec3(1.,.3,.04),vec3(1.,.88,.55),sw);
 col+=dc*disk*(.35+sw*1.3)*(.75+.5*cos(a-.6));
 float pr=length(p);
 col+=vec3(1.,.8,.55)*exp(-pow((pr-.115)*55.,2.))*.9;
 float arc=exp(-pow((length(vec2(p.x,p.y*.8))-.2)*12.,2.))*smoothstep(-.02,.2,p.y)*.6;
 col+=vec3(1.,.6,.3)*arc*(.5+fbm(vec2(atan(p.y,p.x)*3.+t*.4,pr*6.)));
 col*=smoothstep(.095,.12,pr);
 return col; }`),
  G('eclipse', 'Solar Eclipse', 'space', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.01,.01,.03)+vec3(star(p*2.,t,50.))*.5;
 float r=length(p); float a=atan(p.y,p.x);
 float ray=fbm(vec2(a*6.+t*.1,r*3.-t*.15))*.8+fbm(vec2(a*14.,r*7.))*.3;
 float out_=smoothstep(.148,.156,r);
 col+=(vec3(1.,.75,.45)*exp(-(r-.15)*5.5)*(.6+ray*1.1)+vec3(1.,.95,.9)*exp(-(r-.15)*20.)*1.6)*out_;
 col+=vec3(1.,.9,.7)*smoothstep(.006,.0,abs(r-.152))*(.4+.6*pow(.5+.5*sin(a*2.+t*.6),6.))*1.4;
 col*=smoothstep(.146,.152,r)*.9+.1*step(r,.152)*0.;
 return col; }`),

  // ------------------------------------------------------------ LIFESTYLE
  G('aura', 'Aura Orbs', 'lifestyle', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.07,.04,.14);
 for(int i=0;i<5;i++){ float fi=float(i); vec2 c=vec2(.55*sin(t*.23+fi*1.9),.4*cos(t*.19+fi*2.7));
  float d=length(p-c); vec3 oc=hsv2rgb(vec3(fract(.62+fi*.13+.05*sin(t*.1)),.55,1.));
  col+=oc*exp(-d*d*(3.+fi*.4)*2.2)*.75; }
 col+=(hash21(uv*uRes+t)-.5)*.025; return col; }`),
  G('lavalamp', 'Lava Lamp', 'lifestyle', `
vec3 gen(vec2 uv,vec2 p,float t){
 float f=0.;
 for(int i=0;i<6;i++){ float fi=float(i); vec2 c=vec2(.45*sin(t*.31*(1.+fi*.17)+fi*2.),.4*sin(t*.27*(1.+fi*.23)+fi*3.1));
  float d=length(p-c); f+=.011/(d*d+.002); }
 vec3 bg=mix(vec3(.35,.05,.35),vec3(.1,.02,.25),uv.y); vec3 blob=mix(vec3(1.,.4,.2),vec3(1.,.8,.3),uv.y);
 float m=smoothstep(.9,1.05,f); vec3 col=mix(bg,blob,m);
 col+=vec3(1.,.9,.7)*smoothstep(1.05,1.8,f)*.25+vec3(1.,.5,.6)*exp(-abs(f-1.)*6.)*.25; return col; }`),

  // ------------------------------------------------------------ MUSIC
  G('vinyl', 'Spinning Vinyl', 'music', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.14,.06,.2),vec3(.02,.02,.06),length(p)*1.3);
 float r=length(p); float a=atan(p.y,p.x)-t*1.2; float R=.34;
 float disc=smoothstep(R,R-.004,r);
 float grooves=.5+.5*sin(r*420.); float sheen=pow(abs(cos(a*2.)),10.)*.28+pow(abs(cos(a*2.+1.57)),12.)*.1;
 vec3 v=vec3(.05)+grooves*.03+vec3(.9,.85,1.)*sheen*(1.-smoothstep(.1,.34,r)*.3);
 float label=smoothstep(.115,.112,r); vec3 lc=mix(vec3(.95,.3,.45),vec3(1.,.8,.3),.5+.5*sin(a*3.));
 v=mix(v,lc,label); v=mix(v,vec3(.02),smoothstep(.012,.008,r));
 col=mix(col,v,disc); col+=vec3(.6,.3,1.)*exp(-pow((r-R)*30.,2.))*.25;
 return col; }`),
  G('equalizer', 'Equalizer Bars', 'music', `
vec3 gen(vec2 uv,vec2 p,float t){
 float N=24.; float x=uv.x*N; float id=floor(x); float f=fract(x);
 float h=.12+.5*(.5+.5*sin(t*(2.+hash(id)*3.)+id*1.7))*(.55+.45*sin(t*1.3+id*.5+hash(id+9.)*6.));
 float bar=step(.12,f)*step(f,.88); float lvl=uv.y-.1;
 vec3 bc=hsv2rgb(vec3(fract(.9-id/N*.55+t*.03),.8,1.));
 float seg=step(.35,fract(lvl*26.)); float on=step(lvl,h)*step(0.,lvl);
 vec3 col=vec3(.03,.02,.08)+vec3(.3,.1,.5)*(1.-uv.y)*.2;
 col+=bc*bar*on*seg*1.1+bc*bar*exp(-max(lvl-h,0.)*10.)*.12*step(0.,lvl);
 return col; }`),

  // ------------------------------------------------------------ GAMING
  G('arcade', 'Arcade Grid', 'gaming', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=vec3(.03,.0,.09);
 float y=abs(p.y)+.02; float z=.35/y; vec2 g=vec2(p.x*z*1.6,z+t*1.2); vec2 f=abs(fract(g)-.5);
 float l=max(smoothstep(.46,.5,f.x),smoothstep(.46,.5,f.y));
 vec3 gc=mix(vec3(.0,.9,1.),vec3(1.,.1,.8),step(0.,p.y));
 col+=gc*l*exp(-y*3.5)*.9+mix(vec3(.0,.6,.8),vec3(.8,.0,.6),step(0.,p.y))*exp(-y*14.)*.35;
 for(int i=0;i<4;i++){ float fi=float(i); vec2 c=vec2((hash(fi*3.1)-.5)*1.1,.25*sin(t*.6+fi*2.)+(hash(fi*5.7)-.5)*.3);
  vec2 d=rot2(t*.5+fi)*(p-c); float sd=max(abs(d.x),abs(d.y))-.045; col+=hsv2rgb(vec3(fract(.5+fi*.17),.9,1.))*exp(-abs(sd)*70.)*.9; }
 col*=.9+.1*sin(uv.y*uRes.y*1.5); return col; }`),

  // ------------------------------------------------------------ FITNESS
  G('shockwave', 'Shockwave', 'fitness', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.14,.0,.0),vec3(.02,.0,.0),length(p)*1.5);
 float r=length(p); float a=atan(p.y,p.x);
 for(int i=0;i<3;i++){ float fi=float(i); float ph=fract(t*.55+fi*.333); col+=vec3(1.,.35,.1)*exp(-pow((r-ph*.9)*22.,2.))*(1.-ph)*1.1; }
 col+=vec3(1.,.5,.1)*pow(abs(sin(a*14.+t*.4)),12.)*exp(-r*2.2)*.55;
 col+=vec3(1.,.3,.05)*exp(-r*5.)*(.5+.5*pow(1.-fract(t*1.1),3.))*.8;
 return col; }`),

  // ------------------------------------------------------------ CINEMA
  G('dustlight', 'Dust in the Light', 'cinema', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.02,.02,.03),vec3(.07,.06,.07),uv.y);
 vec2 d=vec2(p.x+.5,p.y-.5); float ang=atan(d.y,d.x);
 float beam=smoothstep(.3,.0,abs(ang+.95))*exp(-length(d)*.8);
 float dust=0.;
 for(int i=0;i<3;i++){ float fi=float(i); vec2 q=p*(14.+fi*10.)+vec2(t*.05*(1.+fi),-t*.09*(1.+fi*.6));
  vec2 id=floor(q); vec2 f=fract(q)-.5; vec2 off=(hash22(id+fi*9.)-.5)*.6; float r=.05+.06*hash21(id);
  dust+=smoothstep(r,r*.2,length(f-off))*step(.5,hash21(id+fi))*(.6+.4*sin(t*(1.+hash21(id)*3.)+hash21(id)*20.)); }
 col+=vec3(1.,.85,.6)*beam*.35+vec3(1.,.9,.7)*dust*(.12+beam*1.6);
 return col; }`),

  // ------------------------------------------------------------ TRAVEL
  G('tropical', 'Tropical Sunset', 'travel', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=skyGrad(uv.y,vec3(1.,.55,.2),vec3(.95,.3,.45),vec3(.25,.12,.45));
 vec2 sp=vec2(p.x+.1,uv.y-.46); float sun=smoothstep(.17,.165,length(sp)); col=mix(col,vec3(1.,.9,.45),sun);
 col+=vec3(1.,.6,.3)*exp(-length(sp)*3.5)*.4;
 if(uv.y<.4){ float z=1./(.4-uv.y+.02); float w=noise(vec2(p.x*z*2.,z*3.-t*1.2)); vec3 sea=mix(vec3(.25,.08,.3),vec3(.8,.3,.35),w); sea=mix(sea,vec3(1.,.7,.3),exp(-abs(p.x+.1)*z*1.5)*.5*w); col=mix(sea,col,exp(-(.4-uv.y)*6.)*.6); }
 float pal=0.;
 for(int k=0;k<2;k++){ float fk=float(k); float asp=uRes.x/uRes.y; float sx=mix(-.32,.36,fk)*asp*.95; float sy=mix(.06,.14,fk); float dirn=mix(1.,-1.,fk);
  vec2 c=vec2(sx,sy);
  float trunk=smoothstep(.016,.01,abs(p.x-c.x-.05*dirn*sin((p.y-c.y)*3.)-.04*dirn*(c.y-p.y)))*step(p.y,c.y); pal=max(pal,trunk);
  for(int j=0;j<7;j++){ float ang=-.35+float(j)*.62+.06*sin(t*.8+float(j)+fk*2.);
   vec2 q=rot2(ang)*(p-c); float x=q.x; float y=q.y+x*x*2.2; float w=.016*(1.-x/.3)+.003;
   float fr=step(0.,x)*step(x,.3)*smoothstep(w,w-.004,abs(y))*(.55+.45*step(.5,fract(x*80.))); pal=max(pal,fr); } }
 col=mix(col,vec3(.05,.02,.1),pal);
 return col; }`),
  G('cloudtops', 'Above the Clouds', 'travel', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=skyGrad(uv.y,vec3(1.,.72,.5),vec3(.45,.65,.95),vec3(.15,.3,.7));
 col+=vec3(1.,.85,.6)*exp(-length(p-vec2(.2,-.05))*3.)*.5;
 for(int i=0;i<3;i++){ float fi=float(i); vec2 q=vec2(p.x*(1.2+fi*.5)+t*.03*(1.+fi),uv.y*(3.-fi*.5)+fi*4.);
  float c=fbm(q*vec2(1.,2.2)); float m=smoothstep(.42+fi*.02,.75,c)*smoothstep(.75-fi*.12,.05,uv.y);
  col=mix(col,mix(vec3(.95,.85,.85),vec3(1.),c)*(.85+.15*(1.-uv.y)),m*(.8-fi*.12)); }
 return col; }`),

  // ------------------------------------------------------------ ROMANCE
  G('candle', 'Candlelight', 'romance', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.12,.04,.02),vec3(.03,.01,.01),length(p)*1.2); vec3 bk;
 for(int i=0;i<3;i++){ float fi=float(i); float b=bokeh(p+vec2(.1*sin(t*.2+fi),0.),t*.15,3.5+fi*2.5,.04,fi*9.,bk);
  col+=vec3(1.,.55,.2)*b*(.35+.15*sin(t*7.+fi*3.+uv.x*5.)); }
 float fl=exp(-length((p-vec2(0.,-.12))*vec2(1.6,.8))*7.)*(.8+.2*sin(t*13.)+.1*sin(t*23.));
 col+=vec3(1.,.6,.2)*fl*.8; return col; }`),

  // ------------------------------------------------------------ FUN
  G('popart', 'Pop Art Dots', 'fun', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec2 q=rot2(.6)*(p+vec2(0.,t*.05)); vec2 g=q*28.; vec2 f=fract(g)-.5;
 float rad=.5*(.5+.5*sin(length(p)*5.-t*1.8+atan(p.y,p.x)*3.)); float d=smoothstep(rad,rad-.12,length(f));
 vec3 bgc=mix(vec3(1.,.85,.1),vec3(1.,.3,.5),smoothstep(-.5,.5,sin(p.x*2.+t*.5)+p.y));
 return mix(bgc,vec3(.1,.5,1.),d); }`),
  G('balloons', 'Floating Balloons', 'fun', `
vec3 gen(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.5,.78,1.),vec3(.88,.96,1.),uv.y); float asp=uRes.x/uRes.y;
 col+=vec3(1.)*fbm(vec2(p.x*1.4+t*.02,uv.y*3.))*.12;
 for(int i=0;i<9;i++){ float fi=float(i); float sp=.05+.05*hash(fi*3.3); float y=fract(hash(fi*7.1)+t*sp)*1.6-.3;
  float x=(hash(fi*1.9)-.5)*asp*1.1+.04*sin(t*.8+fi*2.); vec2 c=vec2(x,y-.5); vec2 d=(p-c)*vec2(1.,1.18); float r=.095+.04*hash(fi*9.);
  float body=smoothstep(r,r-.004,length(d)); vec3 bc=hsv2rgb(vec3(hash(fi*5.5),.75,1.));
  vec3 b=bc*(.72+.45*smoothstep(.1,-.1,(d.x*.5-d.y*.7)/r))+vec3(1.)*smoothstep(.22*r,.0,length(d-vec2(-.35,.4)*r))*.7;
  float s=smoothstep(.002,.0,abs(p.x-c.x-.01*sin((p.y-c.y)*30.)))*step(p.y,c.y-r)*step(c.y-r-.35,p.y)*.5;
  col=mix(col,vec3(.4),s); col=mix(col,b,body); }
 return col; }`),

  // ------------------------------------------------------------ EDUCATION
  G('notebook', 'Notebook Paper', 'edu', `
vec3 gen(vec2 uv,vec2 p,float t){
 float asp=uRes.x/uRes.y;
 vec3 col=vec3(.97,.95,.89)-.045*fbm(uv*vec2(asp,1.)*38.);
 float ly=uv.y*20.+t*.1; float d=min(fract(ly),1.-fract(ly)); col=mix(col,vec3(.45,.65,.95),smoothstep(.05,.015,d)*.75);
 col=mix(col,vec3(.95,.35,.4),smoothstep(.004,.0,abs(uv.x-.14))*.8);
 col*=.94+.06*sin(p.x*1.5+t*.3);
 float hs=smoothstep(.0,.03,uv.x-fract(t*.12)*1.3+.25)*smoothstep(.03,.0,uv.x-fract(t*.12)*1.3+.1)*step(abs(uv.y-.5),.04);
 col=mix(col,vec3(1.,.93,.2),hs*.55);
 return col; }`),

  // ------------------------------------------------------------ DARK
  G('glitchgrid', 'Glitch Grid', 'dark', `
vec3 gen(vec2 uv,vec2 p,float t){
 float ft=floor(t*8.); vec3 col=vec3(.02,.0,.03);
 float band=floor(uv.y*mix(10.,40.,hash(ft))); float on=step(.82,hash(band+ft*3.1));
 float off=(hash(band*2.3+ft)-.5)*.3*on; vec2 q=vec2(uv.x+off,uv.y);
 vec2 g=abs(fract(q*vec2(uRes.x/uRes.y,1.)*14.)-.5); float l=smoothstep(.46,.5,max(g.x,g.y));
 col+=vec3(.9,.05,.2)*l*.35+vec3(.0,.9,.9)*l*.2*step(.5,hash(band));
 col+=vec3(.8,.0,.15)*on*.5*(.4+hash(band*9.));
 col*=.85+.15*sin(uv.y*uRes.y*1.4); col+=vec3(hash21(uv*uRes+ft))*.04; return col; }`),
];
