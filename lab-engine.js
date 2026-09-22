/* SuperEnalotto LAB 6 — motore matematico multi-modello
   Nota: i punteggi sono indicatori statistici, non modificano la probabilità matematica reale
   di una sestina in un'estrazione equa. */
(function(){
"use strict";
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))}
function norm(v,min,max){return max===min?.5:(v-min)/(max-min)}
function z(v,a){const s=sd(a);return s?(v-mean(a))/s:0}
function choose(n,k){if(k<0||k>n)return 0;let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return r}
function comboProb(k){return 1/choose(90,6)}
function features(data){
 const s=(data.stats||[]).map(x=>({...x,numero:+x.numero,frequenza:+x.frequenza,ritardo:+x.ritardo,ritardo_massimo:+x.ritardo_massimo}));
 const f=s.map(x=>x.frequenza),d=s.map(x=>x.ritardo),m=s.map(x=>x.ritardo_massimo);
 const mf=mean(f),md=mean(d),mm=mean(m);
 return s.map(x=>{
   const delayRatio=x.ritardo_massimo?x.ritardo/x.ritardo_massimo:0;
   return {...x, freqZ:z(x.frequenza,f), delayZ:z(x.ritardo,d),
     delayRatio, freqNorm:norm(x.frequenza,Math.min(...f),Math.max(...f)),
     delayNorm:norm(x.ritardo,Math.min(...d),Math.max(...d)),
     pressure:Math.max(0,Math.min(1,delayRatio)),
     rarity:1-norm(x.frequenza,Math.min(...f),Math.max(...f)),
     base:1/90};
 });
}
function recentFreq(data,n){
 const draws=(data.ultime_estrazioni||[]).slice(0,n);
 const c=new Map(Array.from({length:90},(_,i)=>[i+1,0]));
 draws.forEach(d=>(d.numeri||[]).forEach(x=>c.set(+x,c.get(+x)+1)));
 return c;
}
function pairMap(data){
 const map=new Map();
 (data.ultime_estrazioni||[]).forEach(d=>{
   const a=d.numeri||[];
   for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
     const k=a[i]+":"+a[j];map.set(k,(map.get(k)||0)+1);
   }
 });
 return map;
}
function comboStats(nums){
 const sorted=[...nums].sort((a,b)=>a-b), sum=sorted.reduce((a,b)=>a+b,0);
 const odd=sorted.filter(x=>x%2).length, low=sorted.filter(x=>x<=45).length;
 const consecutive=sorted.slice(1).filter((x,i)=>x-sorted[i]===1).length;
 const decades=new Set(sorted.map(x=>Math.floor((x-1)/10))).size;
 return {sum,odd,low,consecutive,decades,span:sorted[5]-sorted[0]};
}
function scoreNumbers(data,mode){
 const fs=features(data), rf10=recentFreq(data,10),rf30=recentFreq(data,30),rf100=recentFreq(data,100);
 const r10=[...rf10.values()],r30=[...rf30.values()],r100=[...rf100.values()];
 const pm=pairMap(data);
 return fs.map(x=>{
   const a=norm(rf10.get(x.numero),Math.min(...r10),Math.max(...r10));
   const b=norm(rf30.get(x.numero),Math.min(...r30),Math.max(...r30));
   const c=norm(rf100.get(x.numero),Math.min(...r100),Math.max(...r100));
   const hot=(.45*a+.35*b+.20*c), cold=1-hot;
   let score;
   if(mode==="ritardi") score=.55*x.delayRatio+.30*x.delayNorm+.15*(1-x.freqNorm);
   else if(mode==="caldi") score=.55*x.freqNorm+.30*hot+.15*(1-Math.max(0,x.delayRatio-.8));
   else if(mode==="freddi") score=.55*cold+.30*x.rarity+.15*x.delayNorm;
   else if(mode==="fortuna") score=.30*x.delayRatio+.25*x.freqNorm+.25*hot+.20*x.rarity;
   else if(mode==="montecarlo") score=.25*x.freqNorm+.25*hot+.20*x.delayRatio+.15*x.rarity+.15*Math.random();
   else score=.22*x.freqNorm+.18*x.delayNorm+.18*x.delayRatio+.16*hot+.12*x.rarity+.14*(.5+.5*Math.random());
   return {...x,score:Math.max(.0001,score)};
 });
}
function weightedPick(items,k){
 const pool=items.slice(),out=[];
 while(out.length<k&&pool.length){
   const total=pool.reduce((a,x)=>a+x.score,0);let r=Math.random()*total,idx=0;
   for(;idx<pool.length;idx++){r-=pool[idx].score;if(r<=0)break}
   out.push(pool[idx].numero);pool.splice(idx,1);
 }
 return out.sort((a,b)=>a-b);
}
function comboScore(nums, scored, pairMap){
 const by=new Map(scored.map(x=>[x.numero,x]));
 const vals=nums.map(n=>by.get(n));
 const cs=comboStats(nums);
 const pair=[...Array(nums.length)].reduce((sum,_,i)=>sum,0);
 let pairs=0;for(let i=0;i<nums.length;i++)for(let j=i+1;j<nums.length;j++)pairs+=pairMap.get(nums[i]+":"+nums[j])||0;
 const balance=1-Math.min(1,Math.abs(cs.odd-3)/3)*.55-Math.min(1,Math.abs(cs.low-3)/3)*.35;
 const sumShape=Math.max(0,1-Math.abs(cs.sum-273)/273);
 return vals.reduce((a,x)=>a+x.score,0)/6*.55 + balance*.20 + sumShape*.10 + Math.min(1,pairs/10)*.15;
}
function generate(data,mode,count=8){
 const scored=scoreNumbers(data,mode),pm=pairMap(data),out=[],seen=new Set();
 const target=Math.min(30,Math.max(1,count));
 for(let i=0;i<target*25;i++){
   const nums=weightedPick(scored,6),key=nums.join("-");
   if(!seen.has(key)){seen.add(key);out.push({numeri:nums,punteggio:comboScore(nums,scored,pm),profilo:mode});}
 }
 return out.sort((a,b)=>b.punteggio-a.punteggio).slice(0,target);
}
function simulate(data,mode,runs=20000){
 const scored=scoreNumbers(data,mode),counts=new Map(Array.from({length:90},(_,i)=>[i+1,0]));
 for(let i=0;i<runs;i++)weightedPick(scored,6).forEach(n=>counts.set(n,counts.get(n)+1));
 return scored.map(x=>({...x,simulazioni:counts.get(x.numero),simFreq:counts.get(x.numero)/runs})).sort((a,b)=>b.simFreq-a.simFreq);
}
function build(data){
 const profiles=[
  ["ritardi","Ritardi","Massimo peso a ritardo e rapporto col massimo storico."],
  ["caldi","Numeri caldi","Frequenza storica + frequenza recente."],
  ["freddi","Numeri freddi","Bassa frequenza recente/storica + ritardo."],
  ["statistica","Statistica","Frequenza, ritardo, distribuzione e z-score."],
  ["montecarlo","Monte Carlo","Campionamento ponderato e simulazioni."],
  ["fortuna","Fortuna","Indice composito sperimentale; non è una probabilità reale."],
  ["integrata","LAB Integrata","Combina tutti gli indicatori con filtri di equilibrio."]
 ];
 return {profiles,generate:(mode,n)=>generate(data,mode,n),simulate:(mode,n)=>simulate(data,mode,n)};
}
window.LAB6Math={build,comboStats,choose,comboProb};
})();