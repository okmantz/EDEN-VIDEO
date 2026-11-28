// Cinematic B-roll, part 1: ray-marched 3D scenes. Same format as generators-real.js (each body defines `vec3 gen(vec2 uv, vec2 p, float t)`).
//
// These are not videos and not stock: they are small programs that light a 3D scene on the GPU in real time, with real specular
// reflections, contact shadows, atmospheric depth and a filmic finish. They stay sharp at any resolution (up to 4K export), loop
// forever, cost a few kilobytes and work offline. Nothing in them is copied from any photograph, banknote or logo.
import { REAL } from './generators-real.js';

const G = (id, name, genre, glsl) => ({ id, name, genre, glsl, real: true, cine: true });

/** Shared ray-marching helpers. */
export const RM = `
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float sdRBox(vec3 p,vec3 b,float r){return sdBox(p,b-r)-r;}
mat3 camM(vec3 ro,vec3 ta,float roll){vec3 f=normalize(ta-ro);vec3 r=normalize(cross(f,vec3(sin(roll),cos(roll),0.)));vec3 u=cross(r,f);return mat3(r,u,f);}
vec3 gammaOut(vec3 c){return c;}
// A dark studio with two softboxes: what polished metal reflects.
vec3 envStudio(vec3 d){
 // a photographer's room: warm walls, a big ceiling softbox, a cool strip light on one side, a dark floor
 vec3 c=mix(vec3(.03,.026,.022),vec3(.34,.27,.19),smoothstep(-.25,.9,d.y));
 float k=smoothstep(.9,.45,length(d.xz-vec2(-.2,.12)))*smoothstep(.3,.75,d.y);
 c+=vec3(1.,.82,.58)*k*6.;
 float s=smoothstep(.14,.0,abs(d.x-.8))*smoothstep(-.2,.3,d.y)*smoothstep(1.,.6,d.y);
 c+=vec3(.62,.76,1.)*s*4.;
 float w=smoothstep(.2,.0,abs(d.z+.85))*smoothstep(-.1,.3,d.y)*smoothstep(.9,.5,d.y);
 c+=vec3(1.,.7,.42)*w*2.2;
 return c;
}
`;

/* ------------------------------------------------------------------------------------------------ gold bars */
export const GOLD = `${REAL}${RM}
const float BL=.185, BH=.043, BW=.085;
float taperBar(vec3 q){ float s=1.-.2*clamp(q.y/BH*.5+.5,0.,1.); return sdRBox(vec3(q.x/s,q.y,q.z/s),vec3(BL,BH,BW),.011)*s; }
// pyramid of bars: five layers, each a limited grid of bars; returns distance and an id for per-bar variation
vec2 barsMap(vec3 p){
 float best=p.y, id=-1.;
 for(int k=0;k<5;k++){
  float fk=float(k); float y=BH+fk*(2.*BH+.004);
  float nl=0.,nw=0.; bool ax=true;
  if(k==0){nl=1.;nw=3.;ax=true;} else if(k==1){nl=1.;nw=2.;ax=false;} else if(k==2){nl=0.;nw=2.;ax=true;} else if(k==3){nl=0.;nw=1.;ax=true;} else {nl=0.;nw=0.;ax=false;}
  vec3 q=p-vec3(0.,y,0.);
  float a=ax?q.x:q.z, b=ax?q.z:q.x;
  float ia=clamp(floor(a/.4+.5),-nl,nl), ib=clamp(floor(b/.2+.5),-nw,nw);
  vec3 lp=vec3(a-ia*.4,q.y,b-ib*.2);
  float d=taperBar(lp);
  if(d<best){best=d; id=hash21(vec2(ia+fk*7.,ib-fk*3.));}
 }
 return vec2(best,id);
}
vec3 barsNormal(vec3 p){ vec2 e=vec2(.0012,-.0012); return normalize(e.xyy*barsMap(p+e.xyy).x+e.yyx*barsMap(p+e.yyx).x+e.yxy*barsMap(p+e.yxy).x+e.xxx*barsMap(p+e.xxx).x); }
vec2 barsMarch(vec3 ro,vec3 rd,float tmax,int steps){ float t=.0; float id=-1.; for(int i=0;i<110;i++){ if(i>=steps) break; vec2 h=barsMap(ro+rd*t); id=h.y; if(h.x<.0006*(1.+t)||t>tmax) break; t+=h.x*.9; } return vec2(t,id); }
float barsShadow(vec3 ro,vec3 rd){ float res=1.,t=.02; for(int i=0;i<28;i++){ float h=barsMap(ro+rd*t).x; res=min(res,9.*h/t); t+=clamp(h,.02,.18); if(res<.002||t>3.) break; } return clamp(res,0.,1.); }
vec3 goldColor(float id,vec3 p,vec3 n){
 vec3 g=vec3(1.,.74,.3)*(.9+.14*id); return g; }
vec3 barsShade(vec3 ro,vec3 rd,float t,float id,float T){
 vec3 p=ro+rd*t;
 if(id<0.){
  // polished dark floor: pooled warm light, reflections of the bars and the room
  vec3 n=vec3(0.,1.,0.);
  vec3 L=normalize(vec3(-.55,1.,.35));
  float sh=barsShadow(p+n*.003,L);
  float pool=exp(-dot(p.xz,p.xz)*.55);
  vec3 base=vec3(.05,.045,.04)*(.35+1.6*pool)*mix(.25,1.,sh);
  vec3 rr=reflect(rd,n); vec2 hit=barsMarch(p+n*.004,rr,4.,40);
  float fres=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);
  vec3 refl;
  if(hit.x<4.){ vec3 hp=p+n*.004+rr*hit.x; vec3 hn=barsNormal(hp); float hd=max(dot(hn,L),0.); vec3 rc=goldColor(hit.y,hp,hn)*(.12+.9*hd)*(.5+.5*envStudio(reflect(rr,hn)).r); refl=rc; }
  else refl=envStudio(rr)*.8;
  // keep the floor reflection soft: polished concrete, not a mirror
  return base+refl*fres*.6*(.35+.65*exp(-length(p.xz)*.35));
 }
 vec3 n=barsNormal(p);
 // fine brushed micro-variation so large faces are not perfectly flat
 n=normalize(n+(vec3(noise(p.xz*90.),noise(p.zy*90.+3.),noise(p.xy*90.+7.))-.5)*.02);
 vec3 L=normalize(vec3(-.55,1.,.35));
 vec3 F0=goldColor(id,p,n);
 float ndv=max(dot(n,-rd),0.);
 vec3 F=F0+(vec3(1.)-F0)*pow(1.-ndv,5.);
 vec3 rr=reflect(rd,n);
 vec2 hit=barsMarch(p+n*.003,rr,3.,34);
 vec3 refl;
 if(hit.x<3.&&hit.y>=0.){ vec3 hp=p+n*.003+rr*hit.x; vec3 hn=barsNormal(hp); refl=goldColor(hit.y,hp,hn)*(.1+.55*max(dot(hn,L),0.))*(.4+.6*envStudio(reflect(rr,hn)).r*.6); }
 else if(hit.x<3.){ refl=vec3(.03,.026,.022); }
 else refl=envStudio(rr);
 float sh=barsShadow(p+n*.003,L);
 float ao=clamp(barsMap(p+n*.06).x/.06,.0,1.)*.5+.5*clamp(barsMap(p+n*.16).x/.16,0.,1.);
 vec3 col=F*refl*(.55+.45*mix(.35,1.,sh))*mix(.35,1.,ao);
 col+=F0*.06*max(dot(n,L),0.)*sh;
 // the stamped mark on the top face: a shallow rectangle with tiny characters
 float top=smoothstep(.9,.97,n.y);
 return col;
}
vec3 goldBars(vec2 uv,vec2 p,float t){
 float a=.62+t*.045; float r=2.35;
 vec3 ro=vec3(cos(a)*r,.78+.1*sin(t*.21),sin(a)*r); vec3 ta=vec3(0.,.2,0.);
 mat3 cm=camM(ro,ta,0.);
 vec3 rd=normalize(cm*vec3(p,1.7));
 vec2 h=barsMarch(ro,rd,12.,100);
 vec3 col;
 if(h.x>=12.) col=envStudio(rd)*.5; else col=barsShade(ro,rd,h.x,h.y,t);
 // dust drifting through the key light
 for(int i=0;i<14;i++){ float fi=float(i); vec2 dp=vec2(hash(fi*3.1)-.5,hash(fi*7.7)-.5)*vec2(1.5,1.1); dp+=vec2(.04*sin(t*.3+fi),-.025*t+.02*cos(t*.2+fi*2.)); dp.y=mod(dp.y+.6,1.2)-.6; float d=length(p-dp); col+=vec3(1.,.82,.55)*smoothstep(.02+.012*hash(fi),0.,d)*.16*(.4+.6*sin(t*.8+fi*3.)*.5+.3); }
 return finish(col,uv,t,1.1,.62,.04);
}`;

/* ------------------------------------------------------------------------------------------------ stacks of cash */
const CASH = `${REAL}${RM}
const vec3 BD=vec3(.205,.0165,.088);          // half size of one bundle (a stack of 100 notes)
float bundleD(vec3 q){ return sdRBox(q,BD,.003); }
vec2 cashMap(vec3 p){
 float best=p.y,id=-1.;
 for(int k=0;k<6;k++){
  float fk=float(k); float y=BD.y+fk*(2.*BD.y+.002);
  float nx=1.,nz=2.; bool ax=true;
  if(k==0){nx=1.;nz=2.;ax=true;} else if(k==1){nx=1.;nz=1.;ax=false;} else if(k==2){nx=1.;nz=2.;ax=true;} else if(k==3){nx=0.;nz=1.;ax=false;} else if(k==4){nx=0.;nz=1.;ax=true;} else {nx=0.;nz=0.;ax=false;}
  vec3 q=p-vec3(0.,y,0.);
  float a=ax?q.x:q.z, b=ax?q.z:q.x;
  float ia=clamp(floor(a/.44+.5),-nx,nx), ib=clamp(floor(b/.2+.5),-nz,nz);
  float hh=hash21(vec2(ia+fk*5.,ib+fk*2.));
  vec3 lp=vec3(a-ia*.44+(hh-.5)*.03,q.y,b-ib*.2+(hash21(vec2(hh,fk))-.5)*.02);
  float d=bundleD(lp);
  if(d<best){best=d;id=hh;}
 }
 return vec2(best,id);
}
vec3 cashNormal(vec3 p){ vec2 e=vec2(.001,-.001); return normalize(e.xyy*cashMap(p+e.xyy).x+e.yyx*cashMap(p+e.yyx).x+e.yxy*cashMap(p+e.yxy).x+e.xxx*cashMap(p+e.xxx).x); }
vec2 cashMarch(vec3 ro,vec3 rd,float tmax){ float t=0.,id=-1.; for(int i=0;i<90;i++){ vec2 h=cashMap(ro+rd*t); id=h.y; if(h.x<.0005*(1.+t)||t>tmax) break; t+=h.x*.92; } return vec2(t,id); }
float cashShadow(vec3 ro,vec3 rd){ float res=1.,t=.015; for(int i=0;i<26;i++){ float h=cashMap(ro+rd*t).x; res=min(res,10.*h/t); t+=clamp(h,.015,.2); if(res<.002||t>3.) break; } return clamp(res,0.,1.); }
// the printed face of a note: original ornament only. Frame, guilloche rings, a portrait oval and corner blocks.
vec3 noteFace(vec2 q,float seed){
 float u=q.x,v=q.y;
 vec3 paper=mix(vec3(.46,.62,.42),vec3(.72,.84,.6),fbm(q*7.+seed));
 float r=max(abs(u)*1.0,abs(v)*1.15);
 float frame=smoothstep(.03,0.,abs(r-.9))+smoothstep(.02,0.,abs(r-.8))*.7;
 float d=length(vec2(u*.6,v)); float ang=atan(v,u*.6);
 float guil=.5+.5*sin(d*110.+3.*sin(ang*8.+seed)+4.*sin(u*9.));
 vec3 c=paper*(.82+.26*guil*step(d,.74));
 c=mix(c,vec3(.08,.2,.12),frame*.85);
 float oval=length(vec2(u*1.5,v*.95));
 c=mix(c,mix(vec3(.12,.27,.16),vec3(.5,.66,.44),smoothstep(0.,.5,oval)),smoothstep(.34,.3,oval)*.9);
 float head=smoothstep(.13,.11,length(vec2(u*1.5,(v-.1)*1.1))), sh=smoothstep(.22,.19,length(vec2(u*1.2,(v+.34)*2.)));
 c=mix(c,vec3(.06,.15,.1),max(head,sh)*smoothstep(.34,.3,oval));
 float blk=smoothstep(.012,0.,abs(abs(u)-.72))*step(abs(v),.14)+step(abs(abs(u)-.74),.06)*step(abs(abs(v)-.58),.07);
 c=mix(c,vec3(.07,.18,.1),blk*.6);
 return c;
}
vec3 cashShade(vec3 ro,vec3 rd,float t,float id,float T){
 vec3 p=ro+rd*t;
 vec3 L=normalize(vec3(-.6,1.,.45));
 if(id<0.){
  float sh=cashShadow(p+vec3(0.,.003,0.),L);
  float pool=exp(-dot(p.xz,p.xz)*.4);
  vec3 wood=vec3(.07,.055,.045)*(.5+fbm(vec2(p.x*3.,p.z*40.))*.9);
  float ao=1.-.65*exp(-max(cashMap(p+vec3(0.,.1,0.)).x,0.)*7.);
  return wood*(.25+1.5*pool)*mix(.3,1.,sh)*ao;
 }
 vec3 n=cashNormal(p);
 // find the bundle's local frame again to texture it
 float fk=floor((p.y)/(2.*BD.y+.002));
 float hh=id;
 vec3 col;
 // sides of a stack show the cut edges of the paper: thousands of fine lines with small shifts between sheets
 float edge=1.-smoothstep(.55,.75,abs(n.y));
 float topf=smoothstep(.55,.75,n.y);
 vec2 tq=vec2(p.x*(1./.205)*.9,p.z*(1./.088)*.9);
 // note face on top (random flip per bundle)
 vec3 face=noteFace(vec2(fract(p.x*2.2+hh*3.)*2.-1.,(p.z-floor(p.z/.2+.5)*.2)*11.),hh*9.);
 float lines=.74+.26*noise(vec2(p.y*1600.+hh*40.,(abs(n.x)>.5?p.z:p.x)*3.));
 lines*=.86+.14*noise(vec2(p.y*370.,(abs(n.x)>.5?p.z:p.x)*40.));
 vec3 edgeCol=vec3(.84,.88,.8)*lines*(.88+.12*hh);
 // the paper strap around the middle
 float along=abs(n.x)>.5?p.z:p.x;
 float fl=fract((abs(n.x)>.5?p.z:p.x)/.2+.5)-.5;
 float strapZ=abs(n.x)>.5? 0.:0.;
 col=mix(edgeCol,face,topf);
 // strap: a band of kraft paper wrapping each bundle around its middle
 float lx=(abs(n.z)>.5?p.x:p.x);
 vec3 kraft=vec3(.62,.5,.34)*(.85+.3*noise(p.xz*70.));
 float bx=abs(fract((p.x)/.44+.5)-.5)*.44;
 float strap=smoothstep(.026,.02,bx)*(1.-topf*.0);
 col=mix(col,kraft,strap*step(.3,1.-edge*0.)*(topf+edge*.9));
 float dif=max(dot(n,L),0.);
 float sh=cashShadow(p+n*.003,L);
 float ao=clamp(cashMap(p+n*.04).x/.04,0.,1.)*.55+.45;
 vec3 amb=envStudio(n)*.55+vec3(.03,.035,.03);
 col*= (dif*sh*1.35*vec3(1.,.93,.82)+amb*.6)*ao;
 col+=pow(max(dot(reflect(rd,n),L),0.),30.)*.05*sh;
 return col;
}
vec3 cashStacks(vec2 uv,vec2 p,float t){
 float a=.7+t*.04; float r=1.95;
 vec3 ro=vec3(cos(a)*r,.5+.06*sin(t*.2),sin(a)*r); vec3 ta=vec3(0.,.17,0.);
 mat3 cm=camM(ro,ta,0.);
 vec3 rd=normalize(cm*vec3(p,1.8));
 vec2 h=cashMarch(ro,rd,12.);
 vec3 col;
 if(h.x>=12.){ col=mix(vec3(.01,.02,.015),vec3(.04,.06,.05),uv.y)+.0; }
 else col=cashShade(ro,rd,h.x,h.y,t);
 // soft out-of-focus lights in the dark behind
 col+=vec3(.02,.03,.025)*smoothstep(.2,1.,uv.y)*(.6+.4*fbm(p*2.+t*.02));
 return finish(col,uv,t,1.25,.65,.04);
}`;

/* ------------------------------------------------------------------------------------------------ aerial city */
const AERIAL = `${REAL}
// A grid of towers marched cell by cell. Lit windows, street lights, moving traffic, depth haze and a glowing horizon.
float cityH(vec2 c){
 float h=hash21(c+3.7); float k=noise(c*.12+9.);
 float H=.1+2.7*pow(h,2.6)*(.3+.9*k);
 if(hash21(c*1.7+1.3)<.1) H=.05;
 return H; }
// box intersection: returns near distance or -1, writes the face normal
float boxHit(vec3 ro,vec3 rd,vec3 bmin,vec3 bmax,out vec3 n){
 vec3 inv=1./rd; vec3 t0=(bmin-ro)*inv, t1=(bmax-ro)*inv;
 vec3 tn=min(t0,t1), tf=max(t0,t1);
 float a=max(max(tn.x,tn.y),tn.z), b=min(min(tf.x,tf.y),tf.z);
 if(b<max(a,0.)) return -1.;
 n=-sign(rd)*step(tn.yzx,tn.xyz)*step(tn.zxy,tn.xyz);
 return a; }
vec3 aerial(vec2 uv,vec2 p,float t,float night,float dusk,float day){
 // camera: a drone sliding forward over the rooftops
 vec3 ro=vec3(.5+t*.42,3.45+.12*sin(t*.31),.5+t*.2+.4*sin(t*.11));
 float yaw=.9+.12*sin(t*.09); float pit=-.13;
 vec3 f=normalize(vec3(sin(yaw)*cos(pit),sin(pit),cos(yaw)*cos(pit)));
 vec3 r=normalize(cross(f,vec3(0.,1.,0.))); vec3 u=cross(r,f);
 vec3 rd=normalize(f*1.35+r*p.x+u*p.y);
 // light and sky for the time of day
 vec3 skyH=night*vec3(.2,.1,.09)+dusk*vec3(1.,.5,.26)+day*vec3(.74,.84,.95);
 vec3 skyT=night*vec3(.006,.012,.04)+dusk*vec3(.12,.18,.42)+day*vec3(.18,.4,.78);
 vec3 sunD=normalize(vec3(.5,night*.3+dusk*.1+day*.6,.8));
 vec3 sunC=dusk*vec3(1.,.55,.28)*2.+day*vec3(1.,.93,.82)*3.2;
 vec3 amb=night*vec3(.03,.04,.08)+dusk*vec3(.22,.2,.3)+day*vec3(.32,.4,.5);
 float lit=night*.58+dusk*.3+day*.02;
 vec3 fogC=night*vec3(.13,.07,.07)+dusk*vec3(.85,.45,.28)+day*vec3(.7,.8,.9);
 float fogK=night*.1+dusk*.07+day*.032;
 // sky
 float hz=clamp(rd.y*2.2+.1,0.,1.);
 vec3 sky=mix(skyH,skyT,pow(hz,.6));
 float sd=max(dot(rd,sunD),0.);
 sky+=sunC*(pow(sd,8.)*.35+pow(sd,300.)*1.8)*(dusk+day);
 sky+=vec3(star(rd.xz/(rd.y+.5)*3.,t,60.))*night*smoothstep(.1,.4,rd.y)*.8;
 vec3 col=sky;
 // march the grid
 vec2 cell=floor(ro.xz);
 vec2 stp=sign(rd.xz); vec2 tD=abs(1./rd.xz); vec2 tM=(cell+step(0.,rd.xz)-ro.xz)/rd.xz;
 float hitT=-1.; vec3 hn=vec3(0.); vec2 hc=cell; bool roof=false;
 for(int i=0;i<84;i++){
  float H=cityH(cell);
  vec3 bn; float th=boxHit(ro,rd,vec3(cell.x+.14,0.,cell.y+.14),vec3(cell.x+.86,H,cell.y+.86),bn);
  if(th>0.){ hitT=th; hn=bn; hc=cell; break; }
  if(tM.x<tM.y){ tM.x+=tD.x; cell.x+=stp.x; } else { tM.y+=tD.y; cell.y+=stp.y; }
 }
 float tg=-ro.y/rd.y;                      // the ground plane
 if(hitT<0. && tg>0.) { hitT=tg; hn=vec3(0.,1.,0.); hc=floor(ro.xz+rd.xz*tg); }
 if(hitT>0.){
  vec3 q=ro+rd*hitT;
  float foot=hitT*1.2/uRes.y*1.5;          // roughly how much world a pixel covers here
  vec3 base;
  if(hn.y>.5 && q.y<.02){
   // street level: asphalt, lane lines, lamps and cars
   vec2 fp=fract(q.xz);
   float sx=abs(fp.x-.5), sz=abs(fp.y-.5);
   float onx=step(sx,.5)*step(.0,.0);
   vec3 asp=vec3(.035,.035,.04)*(.7+.6*noise(q.xz*60.));
   float cl=min(abs(fp.x),abs(fp.y)); float cl2=min(abs(fp.x-1.),abs(fp.y-1.)); cl=min(cl,cl2);   // distance to the street centre-lines
   vec3 g=asp;
   float lampL=exp(-cl*cl*9000.)*1.;
   g+=vec3(1.,.62,.3)*exp(-cl*38.)*.25*(night+dusk*.6);
   // cars: bright points drifting along each street
   float trafX=fract(q.x*2.6+t*(.45+hash21(vec2(hc.y,2.))*.5)*(hash21(vec2(hc.y,5.))>.5?1.:-1.)+hc.y*.37);
   float trafZ=fract(q.z*2.6+t*(.45+hash21(vec2(hc.x,8.))*.5)*(hash21(vec2(hc.x,3.))>.5?1.:-1.)+hc.x*.51);
   float carX=exp(-pow(abs(fp.y-.0)*30.,2.))+exp(-pow(abs(fp.y-1.)*30.,2.));
   float carZ=exp(-pow(abs(fp.x-.0)*30.,2.))+exp(-pow(abs(fp.x-1.)*30.,2.));
   float dotX=smoothstep(.12,.0,abs(trafX-.5)-.0)*carX, dotZ=smoothstep(.12,.0,abs(trafZ-.5))*carZ;
   vec3 tail=mix(vec3(1.,.12,.08),vec3(1.,.92,.75),step(.5,hash21(floor(q.xz*2.6))));
   g+=tail*(dotX+dotZ)*(night+dusk*.7+day*.12)*2.2;
   g+=vec3(1.,.7,.4)*exp(-pow(cl*60.,2.))*.5*(night+dusk*.5);
   base=g*(night*1.+dusk*1.+day*3.);
   base=mix(base,vec3(.22,.23,.25)*(day*1.1+dusk*.45+night*.03)+g*.5,day);
  } else {
   // building: dark glass and concrete, lit windows on the sides, small lights on the roofs
   float hh=hash21(hc+11.2);
   if(hn.y>.5){
    base=vec3(.05,.052,.058)*(.7+.6*noise(q.xz*50.))*(.5+day*2.2+dusk*1.);
    float rl=step(.93,hash21(floor(q.xz*14.)+hc));
    base+=vec3(1.,.4,.25)*rl*night*.5;
   } else {
    float uu=abs(hn.x)>.5?q.z:q.x; vec2 wp=vec2(uu*11.,q.y*16.);
    vec2 wc=floor(wp), wf=fract(wp);
    float m=smoothstep(.12,.24,wf.x)*smoothstep(.88,.76,wf.x)*smoothstep(.16,.3,wf.y)*smoothstep(.86,.72,wf.y);
    float rnd=hash21(wc+hc*17.+hn.x*3.);
    float flr=mix(.25,1.,step(.3,hash21(vec2(wc.y,hh+hc.x))));
    float on=smoothstep(1.-lit,1.-lit+.07,rnd+.2*sin(t*(.05+hh*.1)+rnd*40.))*flr;
    vec3 wcol=mix(vec3(.7,.85,1.),vec3(1.,.72,.38),step(hash21(wc.yx+hc),.6))*(.6+.9*hash21(wc+3.3));
    float vis=smoothstep(1.1,3.5,.07/foot);
    vec3 glass=mix(vec3(.02,.025,.035),vec3(.18,.22,.28)*.0,0.);
    // daylight: the glass reflects the sky, and one side of every tower catches the sun
    vec3 fac=mix(vec3(.2,.22,.26),vec3(.7,.78,.88)*(.6+.4*noise(vec2(uu*3.,q.y*2.))),m);
    float sdl=max(dot(hn,sunD),0.)*.9+.1;
    vec3 dayc=fac*(amb*1.2+sunC*sdl*.45)*(1.-.6*(1.-vis)*m);
    vec3 duskc=mix(vec3(.03,.035,.05),vec3(.12,.1,.14),m)*(amb*3.+sunC*sdl*.5);
    vec3 nightc=glass*(1.+.4*noise(vec2(uu*30.,q.y*40.)));
    base=night*nightc+dusk*duskc+day*dayc;
    float winGlow=on*(m*vis+(1.-vis)*.3);
    base+=wcol*winGlow*(night*1.5+dusk*1.1+day*.08);
    base*=mix(.5,1.,clamp(q.y/(cityH(hc)+.01),0.,1.)*.7+.3);   // the lower floors are in shadow
   }
  }
  float fogA=1.-exp(-hitT*fogK);
  col=mix(base,fogC,fogA);
  // a low glow where the city meets the sky
  col+=fogC*exp(-max(rd.y,0.)*14.)*.12*fogA;
 } else {
  col=mix(col,fogC,exp(-max(rd.y,0.)*12.)*.65);
 }
 // slow drifting haze and a touch of lens bloom
 col+=fogC*.05*fbm(vec2(p.x*2.+t*.02,p.y*3.));
 return finish(col,uv,t,1.12,.55,.04);
}`;

/* ------------------------------------------------------------------------------------------------ open ocean */
const OCEAN = `${REAL}${RM}
// A moving sea: a height field marched from the camera, lit by the sun and the sky with proper Fresnel reflection.
float seaOct(vec2 uv,float ch){ uv+=noise(uv); vec2 wv=1.-abs(sin(uv)); vec2 sw=abs(cos(uv)); wv=mix(wv,sw,wv); return pow(1.-pow(wv.x*wv.y,.65),ch); }
float seaH(vec2 xz,float T,float amp0,float ch0,int oct){
 float freq=.16, amp=amp0, ch=ch0, h=0.; vec2 uv=xz; uv.x*=.75;
 for(int i=0;i<5;i++){ if(i>=oct) break; float d=seaOct((uv+T)*freq,ch)+seaOct((uv-T)*freq,ch); h+=d*amp; uv=mat2(1.6,1.2,-1.2,1.6)*uv; freq*=1.9; amp*=.22; ch=mix(ch,1.,.2); }
 return h; }
vec3 seaSky(vec3 rd,vec3 sunD,vec3 hor,vec3 top,vec3 sunC,float cloud,float T){
 float y=max(rd.y,0.);
 vec3 c=mix(hor,top,pow(y,.45));
 float sd=max(dot(rd,sunD),0.);
 c+=sunC*(pow(sd,6.)*.28+pow(sd,70.)*.6+pow(sd,1800.)*40.);
 if(rd.y>0.){ vec2 cq=rd.xz/(rd.y+.14)*1.4+vec2(T*.02,0.); float cl=smoothstep(.45,.9,fbm(cq*1.3))*cloud; c=mix(c,mix(hor*1.1,sunC*.9,pow(sd,3.))*(.7+.4*fbm(cq*4.)),cl*smoothstep(0.,.25,rd.y)); }
 return c; }
vec3 ocean(vec2 uv,vec2 p,float t,float storm){
 float T=t*(.7+storm*.5);
 vec3 ro=vec3(0.,2.7+.15*sin(t*.4),-t*.35);
 vec3 ta=ro+vec3(.0,-.13-.015*sin(t*.3),1.);
 mat3 cm=camM(ro,ta,.0);
 vec3 rd=normalize(cm*vec3(p,1.35));
 vec3 sunD=normalize(vec3(.07,.075,1.));
 vec3 hor=mix(vec3(1.,.55,.3),vec3(.46,.5,.56),storm);
 vec3 top=mix(vec3(.12,.2,.46),vec3(.15,.17,.2),storm);
 vec3 sunC=mix(vec3(1.,.62,.32)*1.7,vec3(.8,.82,.85),storm);
 float amp=mix(.58,1.1,storm), ch=mix(3.6,5.2,storm);
 vec3 col;
 if(rd.y>=-.002){ col=seaSky(rd,sunD,hor,top,sunC,mix(.55,1.,storm),T); }
 else {
  // march to the surface
  float tm=0., tx=(ro.y+amp*1.1)/-rd.y; float hm=seaH((ro+rd*tm).xz,T,amp,ch,3)-(ro+rd*tm).y;
  float tmid=0.;
  float t0=0.;
  float t1=min(tx*1.15+4.,520.);
  vec3 pp=ro+rd*t1; float h1=seaH(pp.xz,T,amp,ch,3)-pp.y;
  float a=0.,b=t1;
  float ha=seaH(ro.xz,T,amp,ch,3)-ro.y;
  for(int i=0;i<10;i++){ tmid=mix(a,b,ha/(ha-h1)); vec3 pm=ro+rd*tmid; float hmid=seaH(pm.xz,T,amp,ch,3)-pm.y; if(hmid<0.){ b=tmid; h1=hmid; } else { a=tmid; ha=hmid; } }
  float dist=tmid; vec3 pt=ro+rd*dist;
  float eps=max(.001*dist*dist*.02,.012)*(1.+dist*.03);
  float hc=seaH(pt.xz,T,amp,ch,5);
  vec3 n=normalize(vec3(seaH(pt.xz+vec2(eps,0.),T,amp,ch,5)-hc,eps*1.5,seaH(pt.xz+vec2(0.,eps),T,amp,ch,5)-hc));
  n=normalize(mix(n,vec3(0.,1.,0.),clamp(dist/160.,0.,.8)));   // the far sea flattens
  float fres=clamp(1.-dot(n,-rd),0.,1.); fres=pow(fres,3.)*.65;
  vec3 rr=reflect(rd,n); rr.y=abs(rr.y);
  vec3 refl=seaSky(rr,sunD,hor,top,sunC,mix(.55,1.,storm),T);
  vec3 deep=mix(vec3(.01,.06,.09),vec3(.02,.05,.06),storm);
  vec3 shallow=mix(vec3(.06,.22,.24),vec3(.09,.13,.14),storm);
  float hh=(pt.y-hc*0.)+.0;
  vec3 refr=mix(deep,shallow,clamp((hc-.2*amp)*1.1,0.,1.)*.7)*(.6+.5*max(dot(n,sunD),0.));
  col=mix(refr,refl,fres);
  col+=sunC*pow(max(dot(reflect(rd,n),sunD),0.),mix(140.,70.,storm))*(.9+.6*(1.-storm))*mix(1.,.3,storm);
  // wave crests catch foam
  float foam=smoothstep(.62,.95,hc/(amp*1.9)+.15*noise(pt.xz*3.))*(.3+.7*storm);
  col=mix(col,vec3(.8,.85,.88)*(.5+.5*max(dot(n,sunD),0.)),foam*.5);
  // distance haze into the horizon
  float fogA=1.-exp(-dist*.012*(1.+storm*1.5));
  col=mix(col,mix(hor,vec3(.5,.55,.6),storm)*.9,fogA*.85);
 }
 return finish(col,uv,t,1.1,.5,.03);
}`;

export const CINE_GENERATORS = [
  G('goldbars', 'Gold Bars', 'finance', `${GOLD}
vec3 gen(vec2 uv,vec2 p,float t){ return goldBars(uv,p,t); }`),
  G('cashstacks', 'Cash Stacks', 'finance', `${CASH}
vec3 gen(vec2 uv,vec2 p,float t){ return cashStacks(uv,p,t); }`),
  G('aerialnight', 'Aerial City · Night', 'city', `${AERIAL}
vec3 gen(vec2 uv,vec2 p,float t){ return aerial(uv,p,t+20.,1.,0.,0.); }`),
  G('aerialdusk', 'Aerial City · Dusk', 'city', `${AERIAL}
vec3 gen(vec2 uv,vec2 p,float t){ return aerial(uv,p,t+20.,0.,1.,0.); }`),
  G('aerialday', 'Aerial City · Day', 'city', `${AERIAL}
vec3 gen(vec2 uv,vec2 p,float t){ return aerial(uv,p,t+20.,0.,0.,1.); }`),
  G('oceansunset', 'Ocean · Sunset', 'nature', `${OCEAN}
vec3 gen(vec2 uv,vec2 p,float t){ return ocean(uv,p,t,0.); }`),
  G('oceanstorm', 'Ocean · Storm', 'nature', `${OCEAN}
vec3 gen(vec2 uv,vec2 p,float t){ return ocean(uv,p,t,1.); }`),
];
