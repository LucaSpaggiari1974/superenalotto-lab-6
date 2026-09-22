/* SuperEnalotto LAB 6 — motore unico integrato
   LAB 6 integra analisi storica, indicatori recenti, co-occorrenze,
   Monte Carlo, backtest e diversificazione del portafoglio.
   Nota: nessun modello cambia la probabilità matematica reale di una sestina
   in un'estrazione equa. Il motore ottimizza solo la selezione statistica. */
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
 const f=s.map(x=>x.frequenza),d=s.map(x=>x.ritardo);
 return s.map(x=>{
   const ratio=x.ritardo_massimo?x.ritardo/x.ritardo_massimo:0;
   return {...x,freqZ:z(x.frequenza,f),delayZ:z(x.ritardo,d),delayRatio:ratio,
     freqNorm:norm(x.frequenza,Math.min(...f),Math.max(...f)),
     delayNorm:norm(x.ritardo,Math.min(...d),Math.max(...d)),
     pressure:Math.max(0,Math.min(1,ratio)),
     rarity:1-norm(x.frequenza,Math.min(...f),Math.max(...f))};
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
   const a=(d.numeri||[]).map(Number).sort((x,y)=>x-y);
   for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
     const k=a[i]+":"+a[j];map.set(k,(map.get(k)||0)+1);
   }
 });
 return map;
}
function tripleMap(data){
 const map=new Map();
 (data.ultime_estrazioni||[]).forEach(d=>{
   const a=(d.numeri||[]).map(Number).sort((x,y)=>x-y);
   for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)for(let k=j+1;k<a.length;k++){
     const key=a[i]+":"+a[j]+":"+a[k];map.set(key,(map.get(key)||0)+1);
   }
 });
 return map;
}
function comboStats(nums){
 const s=[...nums].sort((a,b)=>a-b),sum=s.reduce((a,b)=>a+b,0);
 return {sum,odd:s.filter(x=>x%2).length,low:s.filter(x=>x<=45).length,
 consecutive:s.slice(1).filter((x,i)=>x-s[i]===1).length,
 decades:new Set(s.map(x=>Math.floor((x-1)/10))).size,span:s[5]-s[0]};
}
function integratedScores(data){
 const fs=features(data),r10=recentFreq(data,10),r30=recentFreq(data,30),r100=recentFreq(data,100);
 const v10=[...r10.values()],v30=[...r30.values()],v100=[...r100.values()];
 const last=new Set((data.ultime_estrazioni||[])[0]?.numeri||[]);
 const pm=pairMap(data),tm=tripleMap(data);
 return fs.map(x=>{
   const hot10=norm(r10.get(x.numero),Math.min(...v10),Math.max(...v10));
   const hot30=norm(r30.get(x.numero),Math.min(...v30),Math.max(...v30));
   const hot100=norm(r100.get(x.numero),Math.min(...v100),Math.max(...v100));
   const recent=.50*hot10+.30*hot30+.20*hot100;
   const repeat=last.has(x.numero)?1:0;
   let pair=0,triple=0;
   for(const y of fs){if(y.numero!==x.numero)pair+=pm.get(Math.min(x.numero,y.numero)+":"+Math.max(x.numero,y.numero))||0}
   pair=Math.min(1,pair/Math.max(1,(data.ultime_estrazioni||[]).length*2));
   for(const y of fs)for(const z2 of fs){if(y.numero<x.numero&&z2.numero<y.numero)triple+=tm.get(z2.numero+":"+y.numero+":"+x.numero)||0}
   triple=Math.min(1,triple/Math.max(1,(data.ultime_estrazioni||[]).length));
   const base=.20*x.freqNorm+.14*x.delayNorm+.12*x.delayRatio+.16*recent+.10*x.rarity+.10*pair+.06*triple+.05*(1-repeat)+.07*(.5+.5*Math.random());
   return {...x,score:Math.max(.0001,base)};
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
function comboScore(nums,scored,pm,tm){
 const by=new Map(scored.map(x=>[x.numero,x])),cs=comboStats(nums);
 let pairs=0,triples=0;
 for(let i=0;i<nums.length;i++)for(let j=i+1;j<nums.length;j++)pairs+=pm.get(nums[i]+":"+nums[j])||0;
 for(let i=0;i<nums.length;i++)for(let j=i+1;j<nums.length;j++)for(let k=j+1;k<nums.length;k++)triples+=tm.get(nums[i]+":"+nums[j]+":"+nums[k])||0;
 const balance=1-.50*Math.abs(cs.odd-3)/3-.30*Math.abs(cs.low-3)/3-.20*Math.max(0,cs.consecutive-2)/4;
 const sumShape=Math.max(0,1-Math.abs(cs.sum-273)/273);
 const decade=Math.min(1,cs.decades/5),spread=Math.min(1,cs.span/70);
 const numberScore=nums.reduce((a,n)=>a+by.get(n).score,0)/6;
 return numberScore*.48+balance*.14+sumShape*.10+Math.min(1,pairs/12)*.10+Math.min(1,triples/8)*.06+decade*.06+spread*.06;
}
function portfolioScore(candidate,out){
  if(!out.length)return candidate.punteggio;
  const nums=new Set(candidate.numeri);
  let overlap=0;
  for(const row of out) overlap+=candidate.numeri.filter(n=>row.numeri.includes(n)).length;
  const avgOverlap=overlap/(out.length*6);
  return candidate.punteggio*(1-0.55*avgOverlap);
}
function generate(data,count=8){
 const scored=integratedScores(data),pm=pairMap(data),tm=tripleMap(data),candidates=[],seen=new Set();
 const target=Math.min(30,Math.max(1,count)),poolSize=Math.max(12000,target*1000);
 for(let i=0;i<poolSize;i++){
   const nums=weightedPick(scored,6),key=nums.join("-");
   if(seen.has(key))continue;
   seen.add(key);candidates.push({numeri:nums,punteggio:comboScore(nums,scored,pm,tm)});
 }
 const out=[];
 while(out.length<target&&candidates.length){
   let best=-1,bestScore=-Infinity;
   for(let i=0;i<candidates.length;i++){
     const c=candidates[i],s=portfolioScore(c,out);
     if(s>bestScore){bestScore=s;best=i;}
   }
   if(best<0)break;
   const c=candidates.splice(best,1)[0];
   const maxOverlap=out.reduce((m,x)=>Math.max(m,c.numeri.filter(n=>x.numeri.includes(n)).length),0);
   if(maxOverlap<=3||out.length<2)out.push({...c,portafoglioScore:portfolioScore(c,out),profilo:"LAB 6 Integrata + Monte Carlo"});
 }
 return out;
}
function simulate(data,runs=50000){
 const scored=integratedScores(data),counts=new Map(Array.from({length:90},(_,i)=>[i+1,0]));
 for(let i=0;i<runs;i++)weightedPick(scored,6).forEach(n=>counts.set(n,counts.get(n)+1));
 return scored.map(x=>({...x,simulazioni:counts.get(x.numero),simFreq:counts.get(x.numero)/runs}))
   .sort((a,b)=>b.simFreq-a.simFreq);
}
function backtest(data){
 const draws=(data.ultime_estrazioni||[]).slice().reverse();
 if(draws.length<8)return {draws:0,avg:0,hit2:0,hit3:0,hit4:0,hit5:0,max:0};
 let total=0,hit2=0,hit3=0,hit4=0,hit5=0,max=0,tests=0;
 for(let i=5;i<draws.length;i++){
   const hist={...data,ultime_estrazioni:draws.slice(0,i)};
   const rows=generate(hist,5),actual=new Set(draws[i].numeri); tests+=rows.length;
   for(const row of rows){const h=row.numeri.filter(n=>actual.has(n)).length;total+=h;
     if(h>=2)hit2++;if(h>=3)hit3++;if(h>=4)hit4++;if(h>=5)hit5++;if(h>max)max=h;}
 }
 return {draws:draws.length-5,avg:tests?total/tests:0,hit2:tests?hit2/tests:0,hit3:tests?hit3/tests:0,hit4:tests?hit4/tests:0,hit5:tests?hit5/tests:0,max};
}
function build(data){
 return {
   profiles:[["integrata","LAB Integrata","Motore unico: statistica + Monte Carlo + backtest + diversificazione."]],
   generate:(mode,n)=>generate(data,n),
   simulate:(mode,n)=>simulate(data,n||20000),
   backtest:(mode)=>backtest(data)
 };
}
window.LAB6Math={build,comboStats,choose,comboProb};
})();