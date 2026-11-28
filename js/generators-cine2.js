// Cinematic B-roll, part 2: nature, space, luxury, tech and finance scenes. Same format as generators-real.js.
// Layered depth with atmospheric haze, physically-motivated light, camera-style bokeh and a filmic finish.
import { REAL, SKYLINE } from './generators-real.js';
import { RM } from './generators-cine.js';

const G = (id, name, genre, glsl) => ({ id, name, genre, glsl, real: true, cine: true });

/* ------------------------------------------------------------------------------------------------ nature */
const MOUNTAIN = `${REAL}
float rdg(float x,float s){ float a=.5,f=1.,r=0.; for(int i=0;i<5;i++){ r+=a*(1.-abs(noise(vec2(x*f+s,s*1.7))*2.-1.)); f*=2.07; a*=.5; } return r; }
vec3 mountains(vec2 uv,vec2 p,float t,float warm){
 vec3 hor=mix(vec3(.78,.86,.96),vec3(1.,.72,.46),warm), top=mix(vec3(.2,.42,.82),vec3(.22,.34,.66),warm);
 vec3 col=mix(hor,top,pow(smoothstep(-.05,.85,p.y+.1),.65));
 vec2 sp=vec2(.16,.17); float sd=length(p-sp);
 vec3 sunC=mix(vec3(1.,.96,.88),vec3(1.,.8,.52),warm);
 col+=sunC*(exp(-sd*2.6)*.5+exp(-sd*13.)*.9)+vec3(1.,.98,.92)*smoothstep(.05,.034,sd)*2.4;
 col=mix(col,hor*1.2,smoothstep(.55,.92,fbm(vec2(p.x*1.5+t*.012,p.y*5.5)))*.3*smoothstep(.0,.3,p.y));
 vec3 fog=mix(vec3(.8,.87,.96),vec3(1.,.78,.6),warm);
 for(int i=0;i<7;i++){
  float fi=float(i), d=fi/6.;
  float h=.1-d*.5+(.1+.2*d)*(rdg(p.x*(.7+d*.9)+t*.002*(1.+d*3.),fi*9.3+2.)-.55);
  float m=smoothstep(.0025,-.0025,p.y-h);
  vec3 far=mix(vec3(.66,.68,.84),vec3(.9,.7,.7),warm*.6), near=vec3(.025,.04,.065);
  vec3 lc=mix(far,near,pow(d,.8));
  float sunSide=smoothstep(.6,-.4,p.x-sp.x*.0);
  float rim=smoothstep(.06,0.,h-p.y)*.7*(1.-d*.6)*sunSide;
  col=mix(col,lc+sunC*rim*.8,m);
  float band=exp(-pow((p.y-(h-.05))*7.,2.))*(.3+fbm(vec2(p.x*2.6+t*(.02+d*.035),fi*4.)))*1.5;
  col=mix(col,mix(fog,lc,d*.5)*(1.-d*.2),clamp(band,0.,.85)*(1.-d*.2)*m);
 }
 return finish(col,uv,t,1.0,.5,.03);
}`;

const FOREST = `${REAL}
vec3 forest(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.03,.06,.06),vec3(.5,.62,.52),smoothstep(-.6,.7,p.y)*.55+.2);
 vec2 sun=vec2(-.32,.62);
 vec2 sv=p-sun; float ang=atan(sv.y,sv.x);
 float beam=pow(noise(vec2(ang*10.,t*.05)),1.6)*.6+pow(noise(vec2(ang*23.+4.,t*.09)),2.)*.5;
 float fall=exp(-length(sv)*.85);
 col+=vec3(1.,.86,.55)*beam*fall*1.1+vec3(1.,.9,.7)*exp(-length(sv)*4.)*.9;
 col+=vec3(.55,.75,.7)*fbm(vec2(p.x*1.7+t*.02,p.y*2.1))*.18;
 for(int i=0;i<5;i++){
  float fi=float(i), d=fi/4.; float sc=2.4+fi*2.2;
  float x=p.x*sc+fi*17.3; float id=floor(x), fx=fract(x);
  float cx=.25+.5*hash21(vec2(id+3.,fi)); float w=(.04+.08*hash21(vec2(id,fi)))*(1.-d*.3);
  float on=step(.28,hash21(vec2(id,fi+5.)));
  float dx=abs(fx-cx); float tr=(1.-smoothstep(w-.012,w+.012,dx))*on;
  vec3 tc=mix(vec3(.26,.36,.34),vec3(.008,.014,.014),pow(d,.55));
  float side=clamp((cx-fx)*sign(p.x-sun.x)/w*.5+.5,0.,1.);
  tc+=vec3(1.,.78,.45)*pow(1.-side,2.)*(.22+.5*(1.-d))*fall*2.2*smoothstep(.0,.2,w);
  col=mix(col,mix(tc,vec3(.42,.55,.52),(1.-d)*.35),tr);
 }
 for(int i=0;i<18;i++){ float fi=float(i); vec2 dp=vec2(hash(fi*3.1)-.5,hash(fi*7.3)-.5)*vec2(1.5,1.2); dp+=vec2(.05*sin(t*.2+fi),.03*sin(t*.17+fi*1.7)); float dd=length(p-dp); col+=vec3(1.,.88,.6)*smoothstep(.012+.012*hash(fi),0.,dd)*.3*(.5+.5*sin(t*.8+fi))*fall*2.; }
 return finish(col,uv,t,1.1,.6,.04);
}`;

const SNOW = `${REAL}
vec3 snow(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.012,.02,.055),vec3(.075,.1,.2),uv.y);
 col+=vec3(.03,.05,.09)*fbm(p*2.+t*.01);
 for(int i=0;i<4;i++){ float fi=float(i); vec2 lp=vec2(-.5+.34*fi+.06*sin(fi*2.4),-.02+.05*float(i%2)); col+=vec3(1.,.62,.28)*exp(-length((p-lp)*vec2(1.,1.2))*4.4)*.5+vec3(1.,.8,.5)*exp(-length(p-lp)*36.)*1.1; }
 col+=vec3(1.,.55,.25)*exp(-abs(p.y+.3)*4.)*.1*smoothstep(-.6,.2,p.y);
 for(int L=0;L<4;L++){
  float fl=float(L); float sc=4.5+fl*6.; vec2 q=p*sc; q.y+=t*(.4+fl*.28); q.x+=sin(t*.3+fl*2.+q.y*.4)*.4+t*.07*(fl-1.5);
  vec2 id=floor(q), f=fract(q)-.5; vec2 off=(hash22(id+fl*7.)-.5)*.55;
  float r=(.035+.08*hash21(id+fl))*(1.-fl*.1); float d=length(f-off); float bl=mix(.9,.25,fl/3.);
  float a=smoothstep(r,r*(1.-bl),d)*step(.55,hash21(id+3.));
  float lampLit=exp(-length(p-vec2(-.2,-.02))*2.2);
  vec3 fc=vec3(.8,.88,1.)+vec3(.5,.22,0.)*lampLit;
  col+=fc*a*(.2+.28*fl*.5)*(.6+.8*lampLit);
 }
 return finish(col,uv,t,1.2,.6,.04);
}`;

const DUNES = `${REAL}
float dune(float x,float s){ return .55*sin(x*1.1+s)+.28*sin(x*2.3+s*2.1+1.)+.12*sin(x*5.7+s*.7); }
vec3 dunes(vec2 uv,vec2 p,float t){
 vec3 hor=vec3(1.,.74,.48);
 vec3 col=mix(hor,vec3(.3,.5,.82),smoothstep(-.15,.75,p.y+.15));
 vec2 sp=vec2(.26,.1); float sd=length(p-sp);
 col+=vec3(1.,.84,.56)*(exp(-sd*3.)*.5+exp(-sd*14.)*.7)+vec3(1.,.96,.85)*smoothstep(.04,.028,sd)*2.;
 for(int i=0;i<5;i++){
  float fi=float(i), d=fi/4.;
  float sc=1.55-d*.55; float x=p.x*sc+fi*4.1+t*.004*(1.+d);
  float amp=.05+d*.12; float base=.02-d*.36;
  float h=base+amp*dune(x,fi*3.3);
  float dh=(dune(x+.02,fi*3.3)-dune(x-.02,fi*3.3))/.04*amp*sc;
  float lit=clamp(.5-dh*2.6,0.,1.);
  float m=smoothstep(.0035,-.0035,p.y-h);
  vec3 sand=mix(vec3(.2,.12,.16),vec3(1.,.72,.4),lit)*(.9+.2*d);
  sand*=.8+.32*noise(p*vec2(420.,640.)+fi)+.1*noise(p*vec2(90.,160.)+fi*3.);
  float ripple=.5+.5*sin((p.y-h)*180.+noise(vec2(p.x*8.,fi))*6.);
  sand*=.86+.14*ripple*lit;
  sand=mix(sand,hor*.92,(1.-d)*.5+exp(-(p.y-h)*-1.)*0.);
  float crest=smoothstep(.03,0.,abs(p.y-h))*lit*.35*(1.-d*.5);
  float streak=smoothstep(.62,.95,noise(vec2(p.x*24.-t*2.2,p.y*100.)))*exp(-abs(p.y-h+.015)*50.)*.35*lit;
  col=mix(col,sand+vec3(1.,.8,.55)*(crest+streak),m);
 }
 return finish(col,uv,t,1.08,.5,.035);
}`;

const STORM = `${REAL}
vec3 storm(vec2 uv,vec2 p,float t){
 float fl=step(.9,hash(floor(t*1.15)))*(.55+.45*sin(t*70.)); fl*=smoothstep(.0,.15,fract(t*1.15))*smoothstep(.5,.15,fract(t*1.15));
 vec2 bp=vec2((hash(floor(t*1.15)*3.7)-.5)*.7,.12);
 vec3 col=mix(vec3(.04,.05,.07),vec3(.16,.18,.22),smoothstep(-.6,.5,p.y));
 float z=1./(p.y+.75); vec2 cq=vec2(p.x*z*.9+t*.03,z*1.1+t*.05);
 float d0=fbm(cq)*1.15+.25*fbm(cq*3.1+7.); float d1=fbm(cq+vec2(.06,.05))*1.15+.25*fbm((cq+vec2(.06,.05))*3.1+7.);
 float cover=smoothstep(.34,.72,d0); float lit=clamp(.45+(d0-d1)*9.,0.,1.2);
 vec3 cc=mix(vec3(.05,.06,.08),vec3(.38,.42,.5),lit);
 float lightD=exp(-length((p-bp)*vec2(.8,1.))*2.2);
 cc+=vec3(.55,.62,.95)*fl*lightD*(.4+.9*d0)*1.6;
 col=mix(col,cc,cover);
 // the bolt
 float bx=bp.x+(noise(vec2(p.y*18.,floor(t*1.15)))-.5)*.14+sin(p.y*40.)*.01;
 float bolt=exp(-pow((p.x-bx)*90.,2.))*smoothstep(-.4,.14,p.y)*step(p.y,.14)*fl;
 col+=vec3(.75,.82,1.)*bolt*2.4+vec3(.5,.6,1.)*exp(-pow((p.x-bx)*10.,2.))*fl*.25*smoothstep(-.4,.14,p.y);
 float rain=pow(noise(vec2(p.x*120.+p.y*14.,p.y*4.+t*26.)),14.)*.55+pow(noise(vec2(p.x*70.+p.y*9.+7.,p.y*3.+t*20.)),12.)*.4;
 col+=vec3(.55,.6,.7)*rain*(.5+fl*2.);
 col=mix(col,vec3(.12,.14,.17),smoothstep(-.35,-.7,p.y)*.8);
 return finish(col,uv,t,1.1,.55,.045);
}`;

/* ------------------------------------------------------------------------------------------------ space */
const NEBULA = `${REAL}
vec3 nebula(vec2 uv,vec2 p,float t){
 vec2 q=p*1.35+vec2(.3,.1); float t2=t*.012;
 vec2 w=vec2(fbm(q+t2),fbm(q+vec2(5.2,1.3)-t2));
 float g=fbm(q+w*2.5), g2=fbm(q*2.2+w*3.+7.);
 vec3 c1=vec3(.03,.32,.5), c2=vec3(.72,.18,.5), c3=vec3(1.,.66,.3);
 vec3 col=mix(c1,c2,smoothstep(.3,.78,g));
 col=mix(col,c3,smoothstep(.55,.95,g2)*.75);
 col*=smoothstep(.18,.85,g)*1.5;
 col*=1.-smoothstep(.55,.82,fbm(q*3.2+w))*.6;
 col+=vec3(.08,.1,.2)*fbm(q*.7)*.5;
 for(int i=0;i<3;i++){ float fi=float(i); col+=vec3(star(p+vec2(fi*13.),t*.3,40.+fi*55.))*(.9-fi*.2); }
 for(int i=0;i<10;i++){ float fi=float(i); vec2 sp=vec2(hash(fi*5.3)-.5,hash(fi*9.1)-.5)*vec2(1.5,1.2); vec2 d=p-sp; float core=exp(-length(d)*180.)*1.5; float spike=(exp(-abs(d.x)*260.)*exp(-abs(d.y)*5.)+exp(-abs(d.y)*260.)*exp(-abs(d.x)*5.))*.6; col+=mix(vec3(.8,.9,1.),vec3(1.,.85,.6),hash(fi))*(core+spike)*(.6+.4*sin(t*.6+fi*4.)); }
 return finish(col,uv,t,1.1,.45,.03);
}`;

const MOON = `${REAL}
float crat(vec2 x,float sc){
 vec2 g=x*sc; vec2 id=floor(g), f=fract(g); vec2 c=.3+.4*hash22(id+3.1); float r=.08+.2*hash21(id+7.7); float d=length(f-c);
 float bowl=-smoothstep(r,r*.55,d)*.8; float rim=smoothstep(r*1.25,r,d)*smoothstep(r*.7,r,d)*.55;
 return (bowl+rim)*step(.45,hash21(id+1.3)); }
float lunar(vec2 x){ return crat(x,4.)*.9+crat(x+9.,8.)*.55+.18*fbm(x*7.); }
vec3 moon(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.004,.006,.02),vec3(.02,.03,.07),uv.y);
 col+=vec3(star(p+vec2(4.),t,60.))*.8+vec3(star(p+vec2(14.),t*.7,120.))*.6;
 vec2 m=p-vec2(.0,.04); float R=.36; float r=length(m);
 float ang=t*.035+.9; vec3 L=normalize(vec3(cos(ang)*.8,.35,sin(ang)*.9+.5));
 col+=vec3(.55,.65,1.)*exp(-max(r-R,0.)*8.)*.22*(.4+.6*max(dot(normalize(vec3(m/R,.4)),L),0.));
 if(r<R){
  vec2 mm=m/R; float z=sqrt(max(1.-dot(mm,mm),0.)); vec3 n=vec3(mm,z);
  vec2 s=mm*(1.+.02*z)+vec2(t*.002,0.);
  float e=.02; float h=lunar(s), hx=lunar(s+vec2(e,0.)), hy=lunar(s+vec2(0.,e));
  vec3 np=normalize(n+vec3(-(hx-h),-(hy-h),0.)/e*.016);
  float mare=smoothstep(.46,.62,fbm(s*1.6+3.))*.38;
  vec3 alb=vec3(.62,.6,.57)*(1.-mare)+vec3(.3,.31,.34)*mare; alb*=.82+.3*fbm(s*14.);
  float dif=max(dot(np,L),0.); dif=pow(dif,.85);
  vec3 c=alb*(.012+1.35*dif)*vec3(1.,.98,.94);
  c*=mix(1.,.62,pow(1.-z,2.4));
  col=mix(col,c,smoothstep(R+.002,R-.002,r));
 }
 float w=fbm(vec2(p.x*2.2+t*.03,p.y*7.)); col+=vec3(.2,.24,.35)*smoothstep(.55,.85,w)*.1*smoothstep(.6,.0,abs(p.y-.34));
 return finish(col,uv,t,1.2,.5,.03);
}`;

/* ------------------------------------------------------------------------------------------------ cinema and luxury */
const BOKEH = `${REAL}
vec3 bokehCine(vec2 uv,vec2 p,float t,vec3 A,vec3 B,vec3 bg0,vec3 bg1){
 vec3 col=mix(bg0,bg1,smoothstep(0.,1.,uv.y))+vec3(.02,.015,.01)*fbm(p*3.);
 for(int L=0;L<5;L++){
  float fl=float(L); float s=1.7+fl*1.35; vec2 q=p*s+vec2(t*.028*(fl+1.)*(mod(fl,2.)*2.-1.),t*.01*fl); vec2 id=floor(q), f=fract(q)-.5;
  vec2 off=(hash22(id+fl*13.)-.5)*.5; float r=(.17+.2*hash21(id+fl*5.))*(1.-fl*.06);
  float d=length((f-off)*vec2(1.,1.55));
  float disc=smoothstep(r,r-.035,d)*.3+smoothstep(.022,0.,abs(d-r))*.6;
  float hh=hash21(id+fl*3.); vec3 c=mix(A,B,hh)*(.5+.9*hh);
  float on=step(.42,hash21(id+fl*9.))*(.6+.4*sin(t*(.4+hh)+hh*30.));
  col+=c*disc*on*(.55+.12*fl);
 }
 col+=A*exp(-abs(p.y-.05)*70.)*exp(-abs(p.x)*1.6)*.1;
 return finish(col,uv,t,1.1,.65,.04);
}`;

const MARBLE = `${REAL}
vec3 marble(vec2 uv,vec2 p,float t,float dark){
 vec2 q=p*1.7+vec2(.0,t*.003);
 float w=fbm(q*1.2+fbm(q*2.+t*.008)*1.7);
 float v=abs(sin((q.x*.6+q.y*.95+w*3.3)*3.14159));
 float vein=pow(1.-v,11.);
 float vein2=pow(1.-abs(sin((q.x*1.15-q.y*.5+fbm(q*3.+4.)*2.6)*5.)),20.)*.55;
 float vein3=pow(1.-abs(sin((q.x*.3+q.y*1.3+fbm(q*1.6+9.)*3.)*7.)),30.)*.35;
 vec3 base=dark>.5?mix(vec3(.012,.013,.017),vec3(.085,.086,.1),fbm(q*3.+w)):mix(vec3(.8,.8,.78),vec3(.96,.95,.93),fbm(q*2.+w));
 vec3 gold=vec3(1.,.72,.28);
 vec3 col=dark>.5?base+gold*(vein+vein2+vein3)*1.5:base*(1.-.5*clamp(vein+vein2*.7+vein3*.5,0.,1.))+gold*vein*.35;
 col*=.92+.12*noise(p*400.);
 float sw=exp(-pow((p.x*.7+p.y*.7-(mod(t*.14,3.4)-1.5))*2.8,2.))*.25; col+=sw*(dark>.5?vec3(.9,.8,.7):vec3(1.))*(.4+vein*2.);
 return finish(col,uv,t,1.08,.5,.025);
}`;

const SATIN = `${REAL}
float fold(vec2 q,float t){ float w=sin(q.y*1.35+t*.12+sin(q.x*.9)*1.2); return sin(q.x*2.1+w*1.7+sin(q.y*.7-t*.07)*1.4)*.5+sin(q.x*3.9-q.y*1.1+t*.09+w)*.17; }
vec3 satin(vec2 uv,vec2 p,float t,vec3 base,vec3 hi){
 vec2 q=p*1.7; float e=.012;
 float h=fold(q,t), hx=fold(q+vec2(e,0.),t), hy=fold(q+vec2(0.,e),t);
 vec3 n=normalize(vec3(-(hx-h)/e*.38,-(hy-h)/e*.38,1.));
 vec3 L=normalize(vec3(-.5,.6,.8)); vec3 V=vec3(0.,0.,1.); vec3 H=normalize(L+V);
 vec3 T=normalize(vec3(.2,1.,(hy-h)/e*.38));
 float aniso=sqrt(max(1.-pow(dot(T,H),2.),0.));
 float spec=pow(aniso,60.)*max(dot(n,L),0.);
 float dif=max(dot(n,L),0.);
 vec3 col=base*(.1+.9*pow(dif,1.15))+hi*spec*.95+hi*pow(max(1.-n.z,0.),2.)*.1;
 col*=.8+.3*smoothstep(-1.,1.,h);
 return finish(col,uv,t,1.1,.55,.03);
}`;

const CHAMPAGNE = `${REAL}
vec3 champagne(vec2 uv,vec2 p,float t){
 vec3 col=mix(vec3(.28,.1,.015),vec3(1.,.64,.16),smoothstep(-.5,.75,uv.y));
 col*=.5+.8*exp(-pow(p.x*1.1,2.));
 col+=vec3(1.,.8,.4)*pow(noise(vec2(p.x*5.+t*.05,p.y*.6)),3.)*.35*smoothstep(-.2,.6,p.y);
 vec3 bk; float bb=bokeh(p*2.2+vec2(0.,.4),t,1.,.0,3.3,bk); col+=bk*bb*.14*smoothstep(.1,.7,uv.y)*vec3(1.,.8,.5);
 for(int i=0;i<3;i++){ float fi=float(i); float sc=5.+fi*5.5; vec2 q=vec2(p.x*sc+fi*3.7,p.y*sc);
  float id=floor(q.x), fx=fract(q.x)-.5; float spd=.5+.9*hash21(vec2(id,fi)); float ph=hash21(vec2(id+9.,fi));
  for(int k=0;k<3;k++){ float fk=float(k); float y=fract(t*spd*.1+ph+fk*.33); float cy=mix(-.62,.7,y)*sc; float wob=.16*sin(y*14.+ph*30.+fk*2.)*(.4+y);
   float r=(.075+.075*y)*(.75+.5*hash21(vec2(id+fk,fi+4.)));
   vec2 bq=vec2(fx-wob*.4,q.y-cy); float d=length(bq);
   float ring=smoothstep(.028,0.,abs(d-r))*.75; float hl=smoothstep(r*.4,0.,length(bq-vec2(-r*.38,r*.42)))*1.1; float body=smoothstep(r,r*.1,d)*.12;
   col+=vec3(1.,.9,.7)*(ring+hl+body)*(.75+.2*fi); }
 }
 float foam=smoothstep(.82,1.,uv.y); col=mix(col,vec3(1.,.88,.6)*(.75+.5*fbm(p*20.+t*.1)),foam*.6);
 return finish(col,uv,t,1.15,.5,.035);
}`;

const OIL = `${REAL}
vec3 oil(vec2 uv,vec2 p,float t){
 vec2 q=p*1.2; vec2 w=vec2(fbm(q+t*.018),fbm(q+vec2(3.,7.)-t*.014)); float h=fbm(q*1.4+w*2.3);
 vec3 film=.5+.5*cos(6.28318*(h*2.8+vec3(0.,.33,.67)+t*.015));
 float f=smoothstep(.12,.55,h);
 film=mix(vec3(luma(film)),film,.55); vec3 col=mix(vec3(.008,.01,.016),film*(.12+.7*pow(h,1.6)),f);
 col+=vec3(1.,.95,.9)*pow(max(1.-abs(h-.5)*6.,0.),6.)*.4;
 return finish(col,uv,t,1.3,.5,.03);
}`;

/* ------------------------------------------------------------------------------------------------ tech and finance */
const DATAC = `${REAL}
vec3 datacenter(vec2 uv,vec2 p,float t){
 float W=1.,Hc=.62; float tz=t*1.15;
 float zw=W/max(abs(p.x),.0008), zf=Hc/max(abs(p.y),.0008); float z=min(zw,zf);
 vec3 col=vec3(0.);
 vec3 amb=vec3(.02,.035,.055);
 if(zw<zf){
  float u=z+tz; float v=p.y*z; vec2 cuv=vec2(u/1.25,(v+Hc)/(2.*Hc));
  float cu=floor(cuv.x), fu=fract(cuv.x); float hh=hash21(vec2(cu,sign(p.x)));
  vec3 metal=vec3(.018,.02,.026)*(.8+.4*noise(vec2(u*40.,v*40.)));
  float door=smoothstep(.05,.09,fu)*smoothstep(.95,.91,fu)*smoothstep(.02,.05,cuv.y)*smoothstep(.98,.95,cuv.y);
  vec2 lg=vec2(fu*9.,cuv.y*44.); vec2 lc=floor(lg), lf=fract(lg)-.5;
  float rate=1.5+3.*hash21(lc+cu*7.); float on=step(.55,hash21(lc+cu*11.+floor(t*rate)));
  float led=smoothstep(.34,.18,length(lf*vec2(1.,1.4)))*door;
  float cp=hash21(lc.yy+cu*3.);
  vec3 lcol=cp<.45?vec3(.1,1.,.45):cp<.75?vec3(.15,.6,1.):cp<.92?vec3(1.,.7,.15):vec3(1.,.15,.12);
  col=metal+amb*.3+lcol*led*on*1.6*(.5+.5*door);
  col+=lcol*led*on*.0;
  col+=vec3(.05,.08,.12)*smoothstep(.45,.5,fu)*smoothstep(.55,.5,fu)*.5;
 } else if(p.y<0.){
  float u=z+tz; float v=p.x*z;
  vec3 fl=vec3(.012,.014,.018)*(.8+.4*noise(vec2(u*6.,v*30.)));
  float strip=smoothstep(.05,.0,abs(abs(v)-.46)-.02);
  fl+=vec3(.2,.5,1.)*strip*.35;
  float refl=0.; vec3 rc=vec3(0.); { float rv=v*1.; rc+=vec3(.1,.6,1.)*smoothstep(.1,.0,abs(abs(v)-.8))*.3; }
  fl+=rc;
  col=fl+amb*.2;
 } else {
  float u=z+tz; float v=p.x*z;
  col=vec3(.01,.012,.016);
  float bar=smoothstep(.3,.0,abs(fract(u/2.6)-.5)-.08)*smoothstep(.55,.0,abs(v)-.0);
  col+=vec3(.85,.93,1.)*bar*.9*smoothstep(.0,1.,1.-abs(v)*.8);
 }
 float fog=1.-exp(-z*.07);
 col=mix(col,vec3(.04,.12,.2)*1.2,fog*.9);
 col+=vec3(.12,.3,.5)*exp(-length(p)*5.)*.7;
 return finish(col,uv,t,1.15,.6,.04);
}`;

const TICKER = `${REAL}
float glyph(float tok,vec2 g){
 // a 5x7 block that reads as a character: mirrored left-right, built from a hash of the token
 float gx=min(g.x,4.-g.x); return step(.46,hash21(vec2(tok*3.7+gx*1.3,g.y*2.1+tok)))*step(0.,g.x)*step(g.x,4.)*step(0.,g.y)*step(g.y,6.);
}
vec3 ticker(vec2 uv,vec2 p,float t){
 vec2 q=p; q.x*=1.+.06*q.y; q*=1.1;
 float pitch=.0115; vec2 P=q/pitch; vec2 cell=floor(P); vec2 f=fract(P)-.5;
 float row=floor(cell.y/12.); float ry=mod(cell.y,12.)-2.;
 float spd=(6.+7.*hash21(vec2(row,1.)))*(hash21(vec2(row,2.))>.5?1.:-1.);
 float cx=cell.x+t*spd+row*37.;
 float tok=floor(cx/6.), gx=mod(cx,6.);
 float seg=floor(tok/5.); float isGap=step(4.,mod(tok,5.));
 float up=step(.46,hash21(vec2(seg,row+5.)));
 float on=glyph(hash21(vec2(tok,row))*40.,vec2(gx,ry))*(1.-isGap);
 vec3 lc=mix(vec3(1.,.18,.14),vec3(.1,1.,.42),up);
 float wl=step(mod(tok,5.),1.)*step(.5,hash21(vec2(seg,row+9.))); lc=mix(lc,vec3(.9,.95,1.),wl);
 float dotm=smoothstep(.46,.18,length(f));
 vec3 col=vec3(.008,.01,.012)+lc*on*dotm*1.4+lc*on*.06+vec3(.02)*dotm*.2;
 col+=lc*.03*on;
 col*=.55+.6*smoothstep(1.3,.0,abs(q.y)*1.2);
 float sw=exp(-pow((p.x*.7+p.y*.5-(mod(t*.2,3.)-1.4))*2.4,2.))*.04; col+=sw;
 return finish(col,uv,t,1.1,.55,.035);
}`;

/* ------------------------------------------------------------------------------------------------ gold coins */
const COINS = `${REAL}${RM}
const float CR=.135, CT=.0105;
float coinD(vec3 q){ vec2 w=vec2(length(q.xz)-CR+.004,abs(q.y)-CT+.004); return min(max(w.x,w.y),0.)+length(max(w,0.))-.004; }
// stacks of coins; each coin sits a hair off-centre
vec2 coinMap(vec3 p){
 float best=p.y,id=-1.;
 for(int s=0;s<3;s++){
  float fs=float(s); vec2 c=vec2(-.36+.36*fs,.08*sin(fs*2.1)-.02*fs); float n=fs<.5?10.:fs<1.5?15.:7.;
  vec3 q=p-vec3(c.x,0.,c.y);
  float k=clamp(floor((q.y-CT)/(2.*CT+.0004)+.5),0.,n-1.);
  float hh=hash21(vec2(k,fs*3.1)); vec2 j=(vec2(hash21(vec2(k,fs)),hash21(vec2(fs,k+4.)))-.5)*.012;
  vec3 lq=vec3(q.x-j.x,q.y-(CT+k*(2.*CT+.0004)),q.z-j.y);
  float d=coinD(lq);
  if(d<best){best=d;id=k+fs*20.;}
 }
 // a few coins lying flat in front
 for(int i=0;i<3;i++){ float fi=float(i); vec3 q=p-vec3(-.15+.28*fi,CT,.42+.06*sin(fi*5.)); float a=fi*1.9; q.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*q.xz; float d=coinD(q); if(d<best){best=d;id=60.+fi;} }
 return vec2(best,id);
}
vec3 coinN(vec3 p){ vec2 e=vec2(.0007,-.0007); return normalize(e.xyy*coinMap(p+e.xyy).x+e.yyx*coinMap(p+e.yyx).x+e.yxy*coinMap(p+e.yxy).x+e.xxx*coinMap(p+e.xxx).x); }
vec2 coinMarch(vec3 ro,vec3 rd,float tmax){ float t=0.,id=-1.; for(int i=0;i<110;i++){ vec2 h=coinMap(ro+rd*t); id=h.y; if(h.x<.0004*(1.+t)||t>tmax) break; t+=h.x*.9; } return vec2(t,id); }
// embossed face: a raised rim, a ring of dots and a centre medallion (original design)
float coinRelief(vec2 x){
 float r=length(x); float a=atan(x.y,x.x);
 float rim=smoothstep(.115,.122,r)*smoothstep(.135,.128,r);
 float ring=smoothstep(.006,0.,abs(r-.098))*.6;
 float dots=smoothstep(.0045,0.,length(vec2(fract(a*13./6.2832)-.5,(r-.083)*14.)*vec2(.06,.07)))*.8;
 float med=smoothstep(.065,.055,r)*(.45+.35*cos(r*220.)*smoothstep(.06,.0,abs(r-.035)));
 float star=smoothstep(.045,.0,r*(1.+.55*cos(a*6.)))*.8;
 return rim+ring+dots+med+star;
}
vec3 coins(vec2 uv,vec2 p,float t){
 float a=.9+t*.035; float r=1.28;
 vec3 ro=vec3(cos(a)*r,.4+.04*sin(t*.2),sin(a)*r); vec3 ta=vec3(0.,.12,.1);
 mat3 cm=camM(ro,ta,0.); vec3 rd=normalize(cm*vec3(p,1.75));
 vec2 h=coinMarch(ro,rd,8.);
 vec3 col=envStudio(rd)*.35;
 vec3 L=normalize(vec3(-.5,1.,.4));
 if(h.x<8.){
  vec3 q=ro+rd*h.x;
  if(h.y<0.){
   float pool=exp(-dot(q.xz,q.xz)*.9);
   vec3 n=vec3(0.,1.,0.); vec3 rr=reflect(rd,n); float fres=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);
   vec2 rh=coinMarch(q+n*.003,rr,2.); vec3 rc=rh.x<2.?vec3(1.,.74,.3)*(.2+.5*envStudio(reflect(rr,coinN(q+n*.003+rr*rh.x))).r*.5):envStudio(rr);
   float ao=1.-.7*exp(-coinMap(q+vec3(0.,.04,0.)).x*5.);
   col=vec3(.05,.045,.04)*(.3+1.7*pool)*ao+rc*fres*.5*(.3+.7*pool);
  } else {
   vec3 n=coinN(q);
   // local coordinates for the face and the reeded edge
   vec2 cc=vec2(0.); float fs=floor(h.y/20.); if(h.y>=60.){ cc=vec2(-.15+.28*(h.y-60.),.42+.06*sin((h.y-60.)*5.)); } else { cc=vec2(-.36+.36*fs,.08*sin(fs*2.1)-.02*fs); }
   vec2 lx=q.xz-cc;
   float top=smoothstep(.75,.95,n.y);
   float relief=top*coinRelief(lx);
   float reed=(1.-top)*(.5+.5*cos(atan(lx.y,lx.x)*105.));
   n=normalize(n+vec3(noise(lx*500.)-.5,0.,noise(lx*500.+9.)-.5)*.03);
      float e2=.0025; vec2 gl=vec2(coinRelief(lx+vec2(e2,0.))-coinRelief(lx-vec2(e2,0.)),coinRelief(lx+vec2(0.,e2))-coinRelief(lx-vec2(0.,e2)))/(2.*e2); n=normalize(n+vec3(-gl.x,0.,-gl.y)*.05*top); float shade=1.-.15*relief;
   vec3 F0=pow(vec3(1.,.74,.3),vec3(1.5))*(.85+.2*hash(h.y));
   float ndv=max(dot(n,-rd),0.); vec3 F=F0+(vec3(1.)-F0)*pow(1.-ndv,5.);
   vec3 rr=reflect(rd,n);
   rr=normalize(rr+vec3(cos(lx.x*900.),0.,cos(lx.y*900.))*.0);
   vec3 refl=envStudio(rr);
   float ao=clamp(coinMap(q+n*.03).x/.03,0.,1.)*.6+.4;
   col=F*refl*(.5+.5*ao)*(shade+relief*.5)*(1.+reed*.5);
   col+=F0*.05*max(dot(n,L),0.);
  }
 }
 return finish(col,uv,t,1.1,.62,.04);
}`;

export const CINE2_GENERATORS = [
  G('mountainsunrise', 'Misty Mountains · Sunrise', 'nature', `${MOUNTAIN}
vec3 gen(vec2 uv,vec2 p,float t){ return mountains(uv,p,t,1.); }`),
  G('mountainday', 'Misty Mountains · Day', 'nature', `${MOUNTAIN}
vec3 gen(vec2 uv,vec2 p,float t){ return mountains(uv,p,t,0.); }`),
  G('forestrays', 'Forest Light Rays', 'nature', `${FOREST}
vec3 gen(vec2 uv,vec2 p,float t){ return forest(uv,p,t); }`),
  G('snownight', 'Snowfall · Night', 'nature', `${SNOW}
vec3 gen(vec2 uv,vec2 p,float t){ return snow(uv,p,t); }`),
  G('dunes', 'Desert Dunes', 'travel', `${DUNES}
vec3 gen(vec2 uv,vec2 p,float t){ return dunes(uv,p,t); }`),
  G('stormclouds', 'Storm Clouds', 'dark', `${STORM}
vec3 gen(vec2 uv,vec2 p,float t){ return storm(uv,p,t); }`),
  G('nebula', 'Deep Space Nebula', 'space', `${NEBULA}
vec3 gen(vec2 uv,vec2 p,float t){ return nebula(uv,p,t); }`),
  G('moonrise', 'Moon', 'space', `${MOON}
vec3 gen(vec2 uv,vec2 p,float t){ return moon(uv,p,t); }`),
  G('bokehwarm', 'Cinema Bokeh · Warm', 'cinema', `${BOKEH}
vec3 gen(vec2 uv,vec2 p,float t){ return bokehCine(uv,p,t,vec3(1.,.62,.25),vec3(1.,.82,.5),vec3(.03,.02,.02),vec3(.09,.05,.03)); }`),
  G('bokehteal', 'Cinema Bokeh · Teal & Orange', 'cinema', `${BOKEH}
vec3 gen(vec2 uv,vec2 p,float t){ return bokehCine(uv,p,t,vec3(1.,.55,.2),vec3(.2,.75,.85),vec3(.01,.03,.04),vec3(.03,.08,.1)); }`),
  G('marbleblack', 'Black Marble · Gold', 'lifestyle', `${MARBLE}
vec3 gen(vec2 uv,vec2 p,float t){ return marble(uv,p,t,1.); }`),
  G('marblewhite', 'White Marble · Gold', 'lifestyle', `${MARBLE}
vec3 gen(vec2 uv,vec2 p,float t){ return marble(uv,p,t,0.); }`),
  G('satinchampagne', 'Satin · Champagne', 'lifestyle', `${SATIN}
vec3 gen(vec2 uv,vec2 p,float t){ return satin(uv,p,t,vec3(.82,.62,.42),vec3(1.,.92,.78)); }`),
  G('satinmidnight', 'Satin · Midnight', 'lifestyle', `${SATIN}
vec3 gen(vec2 uv,vec2 p,float t){ return satin(uv,p,t,vec3(.05,.07,.2),vec3(.65,.75,1.)); }`),
  G('champagne', 'Champagne Bubbles', 'music', `${CHAMPAGNE}
vec3 gen(vec2 uv,vec2 p,float t){ return champagne(uv,p,t); }`),
  G('oilslick', 'Iridescent Oil', 'cinema', `${OIL}
vec3 gen(vec2 uv,vec2 p,float t){ return oil(uv,p,t); }`),
  G('datacenter', 'Data Center', 'tech', `${DATAC}
vec3 gen(vec2 uv,vec2 p,float t){ return datacenter(uv,p,t); }`),
  G('tickerboard', 'Market Ticker Board', 'finance', `${TICKER}
vec3 gen(vec2 uv,vec2 p,float t){ return ticker(uv,p,t); }`),
  G('goldcoins', 'Gold Coins', 'finance', `${COINS}
vec3 gen(vec2 uv,vec2 p,float t){ return coins(uv,p,t); }`),
  G('skylinesunrise', 'Skyline · Sunrise', 'city', `${REAL}${SKYLINE}
vec3 gen(vec2 uv,vec2 p,float t){
 return cityShot(uv,p,t,vec3(.1,.2,.46),vec3(.78,.55,.58),vec3(1.,.68,.4),vec3(1.,.6,.3),vec3(.82,.55,.46),vec3(.05,.07,.1),.16,0.,1.,.95); }`),
  G('skylinemidday', 'Skyline · Midday', 'city', `${REAL}${SKYLINE}
vec3 gen(vec2 uv,vec2 p,float t){
 return cityShot(uv,p,t,vec3(.18,.42,.82),vec3(.52,.7,.94),vec3(.86,.92,1.),vec3(1.,.95,.85),vec3(.6,.7,.84),vec3(.05,.16,.26),.02,0.,.6,1.0); }`),
  G('skylinemist', 'Skyline · Morning Mist', 'city', `${REAL}${SKYLINE}
vec3 gen(vec2 uv,vec2 p,float t){
 return cityShot(uv,p,t,vec3(.42,.5,.6),vec3(.62,.68,.76),vec3(.82,.84,.88),vec3(.9,.9,.92),vec3(.68,.72,.8),vec3(.08,.12,.17),.1,0.,.2,1.0); }`),
];
