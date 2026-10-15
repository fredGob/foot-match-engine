// Reprend les notes d'un fichier CSV de notes détaillées (une ligne par joueur, colonnes nom, team, position, sprintSpeed…)
// et les met dans les clubs de Ligue 1 de equipes.json. Voir CLAUDE.md, « Les clubs de Ligue 1 » (n° 115).
// Usage : node tools/notes.js fichier.csv equipes.json          (montre seulement ce qui changerait)
//         node tools/notes.js fichier.csv equipes.json ecrire   (réécrit les lignes "notes" des joueurs trouvés)
const fs=require('fs');
function parseCSV(s){const rows=[];let row=[],f='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c=='"'){if(s[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!='\r')f+=c}if(f||row.length){row.push(f);rows.push(row)}return rows}
const R=parseCSV(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));const H=R[0];
const fc=R.slice(1).filter(r=>r.length>5).map(r=>Object.fromEntries(H.map((h,i)=>[h,isNaN(+r[i])||r[i]===''?r[i]:+r[i]])));
const norm=s=>s.replace(/æ/g,'ae').replace(/Æ/g,'Ae').replace(/[øØ]/g,'o').replace(/ß/g,'ss').replace(/[łŁ]/g,'l').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
const TEAM={psg:'Paris SG',lens:'RC Lens',lille:'LOSC Lille',lyon:'OL',marseille:'OM',rennes:'Stade Rennais FC',monaco:'AS Monaco',strasbourg:'Strasbourg',toulouse:'Toulouse FC',lorient:'FC Lorient','paris-fc':'Paris FC',brest:'Stade Brestois 29',angers:'Angers SCO','le-havre':'Havre AC',auxerre:'AJ Auxerre',nice:'OGC Nice'};
const POS={G:['GK'],D:['CB','LB','RB','LWB','RWB'],M:['CM','CDM','CAM','LM','RM'],A:['ST','LW','RW','CF','CAM']};
const ligne=p=>p=='G'?'G':/^(AG|AD|DC)/.test(p)?'D':/^(M)/.test(p)?'M':'A';
const avg=(...a)=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
const cl=v=>Math.max(1,Math.min(100,v));
function notes(x,old,gk){const n={...old};
 const set=(k,v)=>n[k]=cl(v);
 set('vitesse',x.sprintSpeed);set('acceleration',x.acceleration);set('endurance',x.stamina);
 set('passe',avg(x.shortPassing,x.shortPassing,gk?x.gkKicking:x.longPassing));set('vision',x.vision);
 set('prise_de_balle',x.ballControl);set('dribble',x.dribbling);set('finition',x.finishing);set('frappe_de_loin',x.longShots);
 set('tacle',avg(x.standingTackle,x.slidingTackle));set('placement',gk?x.gkPositioning:x.defensiveAwareness);
 set('anticipation',gk?avg(x.gkPositioning,x.reactions):avg(x.interceptions,x.reactions));set('lucidite',x.reactions);
 set('sang_froid',x.composure);set('agressivite',x.aggression);set('jeu_de_tete',avg(x.headingAccuracy,x.jumping));set('appels',x.positioning);
 if(gk){set('reflexes',x.gkReflexes);set('mains',x.gkHandling)}
 return n}
const file=process.argv[3];const txt=fs.readFileSync(file,'utf8');const E=JSON.parse(txt);
const rep=[];const upd=new Map();
for(const t of E.equipes){ if(!t.championnat) continue;
 const before=[],after=[];let ok=0,tot=0;
 for(const [i,j] of [...t.joueurs.map(j=>[1,j]),...(t.remplacants||[]).map(j=>[0,j])]){ tot++;
  const n=norm(j.nom),ini=/^([a-z]) (.+)$/.exec(n);
  const score=x=>{const m=norm(x.nom);if(m==n)return 3;const tk=m.split(' ');if(ini)return (tk[0][0]==ini[1]&&tk.slice(1).join(' ').endsWith(ini[2]))?2:0;if(tk.slice(-n.split(' ').length).join(' ')==n)return 2;if((' '+m+' ').includes(' '+n+' '))return 1;return 0};
  let c=fc.map(x=>[score(x),x]).filter(a=>a[0]>0);const same=c.filter(a=>a[1].team==TEAM[t.id]);if(same.length)c=same;
  const best=Math.max(0,...c.map(a=>a[0]));c=c.filter(a=>a[0]==best);
  const pn=j.poste_naturel||j.poste; if(c.length>1&&pn&&c.every(a=>a[1].team==TEAM[t.id])){const L=ligne(pn);const f=c.filter(a=>POS[L].includes(a[1].position));if(f.length==1)c=f}
  const m=v=>Object.values(v).reduce((a,b)=>a+b,0)/Object.values(v).length;
  if(c.length!=1){ if(i)before.push(m(j.notes)),after.push(m(j.notes)); rep.push([t.id,j.nom,'garde']);continue}
  ok++;const x=c[0][1];const gk=(j.poste_naturel||j.poste)=='G';const nn=notes(x,j.notes,gk);
  if(i){before.push(m(j.notes));after.push(m(nn))}
  upd.set(j,nn); if(x.team!=TEAM[t.id]) rep.push([t.id,j.nom,'= '+x.nom+' ('+x.team+')']);
 }
 const mean=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);
 console.log(t.id.padEnd(11),'trouvés',ok+'/'+tot,'moyenne titulaires',mean(before),'->',mean(after));
}
fs.writeFileSync('notes-rapport.json',JSON.stringify(rep,null,0));
if(process.argv[4]=='ecrire'){
 const key=new Map();for(const t of E.equipes)for(const j of [...t.joueurs,...(t.remplacants||[])])if(upd.has(j))key.set(t.id+'|'+j.nom,upd.get(j));
 let id=null,done=0;const lines=txt.split('\n').map(l=>{const mi=/"id": "([^"]+)"/.exec(l);if(mi)id=mi[1];
  const mn=/"nom": ("(?:[^"\\]|\\.)*")[^\n]*"notes": \{([^}]*)\}/.exec(l);if(!mn)return l;const nn=key.get(id+'|'+JSON.parse(mn[1]));if(!nn)return l;done++;
  const fmt=mn[2].replace(/"(\w+)": *(\d+)/g,(z,k,v)=>'"'+k+'": '+String(nn[k]).padStart(3));return l.replace(mn[2],fmt).replace(/"source": "[^"]*",( *)/,(z,sp)=>{const s="\"source\": \"détaillé\",";return s+" ".repeat(Math.max(1,z.length-s.length))})});
 fs.writeFileSync(file,lines.join('\n'));console.log('lignes réécrites',done,'sur',upd.size);}
