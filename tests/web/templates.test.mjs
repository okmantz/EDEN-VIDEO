
const J=new URL('../../docs/js/', import.meta.url).href;
let T; try { T = await import(J+'templates.js'); } catch(e){ console.log('IMPORT FAIL', e.message); process.exit(1); }
const {TEMPLATES}=T;
const {GENERATORS}=await import(J+'generators.js'); const {TRANSITIONS,EFFECTS}=await import(J+'effects.js');
const {TEXT_PRESETS}=await import(J+'textrender.js'); const {MUSIC,SFX}=await import(J+'synth.js');
const gens=new Set(GENERATORS.map(g=>g.id)), trs=new Set(TRANSITIONS.map(t=>t.id)), fxs=new Set(EFFECTS.map(t=>t.id)), tp=new Set(TEXT_PRESETS.map(t=>t.name)), mus=new Set(MUSIC.map(m=>m.id)), sfx=new Set(SFX.map(m=>m.id));
let bad=0; const e=(m)=>{bad++;console.log('BAD',m)};
for(const t of TEMPLATES){
 if(!mus.has(t.music)) e(t.id+' music '+t.music);
 if(!gens.has(t.gen)) e(t.id+' gen '+t.gen);
 if(t.cover?.gen && !gens.has(t.cover.gen)) e(t.id+' cover '+t.cover.gen);
 if(t.trans && !trs.has(t.trans.type)) e(t.id+' trans '+t.trans.type);
 if(t.sfx && !sfx.has(t.sfx.id)) e(t.id+' sfx '+t.sfx.id);
 for(const f of t.fxLayers||[]) if(!fxs.has(f.type)) e(t.id+' fxlayer '+f.type);
 t.slots.forEach((s,i)=>{ if(s.gen&&!gens.has(s.gen)) e(t.id+' slot gen '+s.gen); for(const [id] of s.fx||[]) if(!fxs.has(id)) e(t.id+' slot fx '+id); });
 for(const l of t.layers){ if(!tp.has(l.style)) e(t.id+' style '+l.style); if(l.slot>=t.slots.length) e(t.id+' layer slot'); const ks=[...l.text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]); for(const k of ks) if(!t.inputs.find(i=>i.id===k)) e(t.id+' input '+k); }
}
console.log(TEMPLATES.length,'templates;',bad,'problems');
