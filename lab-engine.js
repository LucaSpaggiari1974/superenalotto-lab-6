/* SuperEnalotto LAB 6 — motore integrato v15
   Selezione statistica multi-finestra + co-occorrenze normalizzate +
   simulazione stocastica + backtest walk-forward + diversificazione.
   Nessun modello modifica la probabilità matematica reale di una sestina
   in un'estrazione equa: il motore ottimizza esclusivamente la selezione. */
(function(){
"use strict";

const N=90,K=6;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))}
function norm(v,min,max){return max===min?.5:(v-min)/(max-min)}
function choose(n,k){if(k<0||k>n)return 0;let r=1;for(let i=1;i<=k;i++)r*=((n-k+i)/i);return r}
function comboProb(k=6){return 1/choose(90,k)}
function key2(a,b){return a<b?a+":"+b:b+":"+a}
function key3(a,b,c){return [a,b,c].sort((x,y)=>x-y).join(":")}
function drawsOf(data){return (data.ultime_estrazioni||[]).filter(d=>Array.isArray(d.numeri)&&d.numeri.length===6).map(d=>d.numeri.map(Number).sort((a,b)=>a-b))}
function countMap(draws){const m=new Map(Array.from({length:N},(_,i)=>[i+1,0]));draws.forEach(d=>d.forEach(n=>m.set(n,m.get(n)+1)));return m}
function windowFreq(draws,n){return countMap(draws.slice(0,n))}
function empiricalShape(draws){
 const parity=Array(7).fill(0),low=Array(7).fill(0),sums=[];
 draws.forEach(d=>{const odd=d.filter(n=>n%2).length,l=d.filter(n=>n<=45).length;parity[odd]++;low[l]++;sums.push(d.reduce((a,b)=>a+b,0))});
 const total=Math.max(1,draws.length);
 return {parity:parity.map(x=>x/total),low:low.map(x=>x/total),sumMean:mean(sums),sumSd:sd(sums)||40};
}
function cooccurrence(draws){
 const pairs=new Map(),triples=new Map();
 draws.forEach(d=>{
   for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){const k=key2(d[i],d[j]);pairs.set(k,(pairs.get(k)||0)+1)}
   for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)for(let k=j+1;k<6;k++){const q=key3(d[i],d[j],d[k]);triples.set(q,(triples.get(q)||0)+1)}
 });
 return {pairs,triples};
}
function liftPair(a,b,pairs,total){
 const obs=pairs.get(key2(a,b))||0;
 if(total<2)return 0;
 const ca=(a.count||0),cb=(b.count||0),pA=ca/total,pB=cb/total,expected=total*15*pA*pB;
 return clamp((obs+0.5)/(expected+0.5)-1,-1,2);
}
function features(data){
 const draws=drawsOf(data),stats=(data.stats||[]).map(x=>({...x,numero:+x.numero,frequenza:+x.frequenza,ritardo:+x.ritardo,ritardo_massimo:+x.ritardo_massimo}));
 const global=countMap(draws),co=cooccurrence(draws),total=Math.max(1,draws.length),f=stats.map(x=>x.frequenza),d=stats.map(x=>x.ritardo);
 const fmin=Math.min(...f),fmax=Math.max(...f),dmin=Math.min(...d),dmax=Math.max(...d);
 const r10=windowFreq(draws,10),r30=windowFreq(draws,30),r100=windowFreq(draws,100),r180=windowFreq(draws,180);
 return {draws,shape:empiricalShape(draws),co,total,rows:stats.map(x=>{
   const n=x.numero, recent=(.42*norm(r10.get(n),0,Math.max(...r10.values()))+.28*norm(r30.get(n),0,Math.max(...r30.values()))+.18*norm(r100.get(n),0,Math.max(...r100.values()))+.12*norm(r180.get(n),0,Math.max(...r180.values())));
   const p=(global.get(n)||0)/(total*6), bayes=(global.get(n)+1)/(total*6+N);
   const expected=1/N, freqSignal=clamp(.5+.5*((bayes-expected)/Math.max(expected,.0001)));
   const delayRatio=x.ritardo_massimo?clamp(x.ritardo/x.ritardo_massimo):0;
   return {...x,count:global.get(n)||0,freqNorm:norm(x.frequenza,fmin,fmax),delayNorm:norm(x.ritardo,dmin,dmax),
     delayRatio,recent,frequencySignal:freqSignal,rarity:1-norm(x.frequenza,fmin,fmax),lastSeen:0};
 })};
}
function integratedScores(data){
 const f=features(data),last=new Set(f.draws[0]||[]);
 const byCount=new Map(f.rows.map(x=>[x.numero,x]));
 const recentSet=(n)=>new Set(f.draws.slice(0,n).flat());
 const r10=recentSet(10),r30=recentSet(30),r100=recentSet(100);
 const scored=f.rows.map(x=>{
   const repeat=last.has(x.numero)?1:0;
   const recentPresence=(.50*(r10.has(x.numero)?1:0)+.30*(r30.has(x.numero)?1:0)+.20*(r100.has(x.numero)?1:0));
   let pairLift=0,pairN=0;
   for(const y of f.rows)if(y.numero!==x.numero){pairLift+=liftPair(x,y,f.co.pairs,f.total);pairN++}
   pairLift=pairN?clamp(.5+pairLift/(2*pairN)):0.5;
   const base=.18*x.freqNorm+.12*x.delayNorm+.08*x.delayRatio+.18*x.recent+.10*x.frequencySignal+
     .08*x.rarity+.12*pairLift+.05*recentPresence+.04*(1-repeat)+.05*(f.total>=60?1:0);
   return {...x,score:Math.max(.0001,base),pairLift};
 });
 const total=mean(scored.map(x=>x.score));
 return {scored,shape:f.shape,co:f.co,total:f.total,draws:f.draws,scoreMean:total};
}
function weightedPick(items,k,rng=Math.random){
 const pool=items.slice(),out=[];
 while(out.length<k&&pool.length){
   const total=pool.reduce((a,x)=>a+x.score,0);let r=rng()*total,idx=0;
   for(;idx<pool.length;idx++){r-=pool[idx].score;if(r<=0)break}
   out.push(pool[idx].numero);pool.splice(idx,1);
 }
 return out.sort((a,b)=>a-b);
}
function structureScore(nums,shape){
 const s=[...nums].sort((a,b)=>a-b),odd=s.filter(x=>x%2).length,low=s.filter(x=>x<=45).length,sum=s.reduce((a,b)=>a+b,0);
 const parity=shape.parity[odd]||0,lo=shape.low[low]||0;
 const sumFit=Math.exp(-0.5*((sum-shape.sumMean)/shape.sumSd)**2);
 const consecutive=s.slice(1).filter((x,i)=>x-s[i]===1).length;
 const consecutivePenalty=consecutive>2?Math.max(0,1-(consecutive-2)*.22):1;
 const spread=(s[5]-s[0])/89;
 return clamp(.36*clamp(parity*8)+.28*clamp(lo*8)+.22*sumFit+.14*spread)*consecutivePenalty;
}
function comboScore(nums,model){
 const {scored,co,total,shape}=model,by=new Map(scored.map(x=>[x.numero,x]));
 let pair=0,trip=0;
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
   const a=by.get(nums[i]),b=by.get(nums[j]);
   pair+=liftPair(a,b,co.pairs,total);
 }
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)for(let k=j+1;k<6;k++){
   const obs=co.triples.get(key3(nums[i],nums[j],nums[k]))||0;
   trip+=Math.log1p(obs);
 }
 pair=clamp(.5+pair/30);
 trip=clamp(trip/30);
 const numberScore=nums.reduce((a,n)=>a+by.get(n).score,0)/6;
 const structure=structureScore(nums,shape);
 return clamp(.58*numberScore+.16*structure+.12*pair+.08*trip+.06*(new Set(nums.map(n=>Math.floor((n-1)/10))).size/6));
}
function portfolioPenalty(candidate,out){
 if(!out.length)return 1;
 const avg=out.reduce((a,row)=>a+candidate.numeri.filter(n=>row.numeri.includes(n)).length,0)/(out.length*6);
 return clamp(1-.70*avg);
}
function generate(data,count=10){
 const target=Math.min(30,Math.max(1,count)),model=integratedScores(data),candidates=[],seen=new Set();
 const poolSize=Math.max(15000,target*1200);
 for(let i=0;i<poolSize;i++){
   const nums=weightedPick(model.scored,6),key=nums.join("-");
   if(seen.has(key))continue;
   seen.add(key);candidates.push({numeri:nums,punteggio:comboScore(nums,model)});
 }
 const out=[];
 while(out.length<target&&candidates.length){
   let bi=-1,bs=-Infinity;
   for(let i=0;i<candidates.length;i++){const c=candidates[i],s=c.punteggio*portfolioPenalty(c,out);if(s>bs){bs=s;bi=i}}
   if(bi<0)break;
   const c=candidates.splice(bi,1)[0],maxOverlap=out.reduce((m,x)=>Math.max(m,c.numeri.filter(n=>x.numeri.includes(n)).length),0);
   if(maxOverlap<=3||out.length<2)out.push({...c,portafoglioScore:bs,profilo:"LAB 6 Integrata v15"});
 }
 return out;
}
function simulate(data,runs=20000){
 const model=integratedScores(data),counts=new Map(Array.from({length:N},(_,i)=>[i+1,0]));
 for(let i=0;i<runs;i++)weightedPick(model.scored,6).forEach(n=>counts.set(n,counts.get(n)+1));
 return model.scored.map(x=>({...x,simulazioni:counts.get(x.numero),simFreq:counts.get(x.numero)/runs})).sort((a,b)=>b.simFreq-a.simFreq);
}
function randomCombo(){const a=Array.from({length:N},(_,i)=>i+1);for(let i=N-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,6).sort((x,y)=>x-y)}
function backtest(data){
 const draws=drawsOf(data).slice().reverse();
 if(draws.length<15)return {draws:0,avg:0,hit2:0,hit3:0,hit4:0,hit5:0,max:0,baselineAvg:0,lift:0};
 let total=0,hit2=0,hit3=0,hit4=0,hit5=0,max=0,tests=0,baseTotal=0;
 for(let i=15;i<draws.length;i++){
   const hist={...data,ultime_estrazioni:draws.slice(0,i).map(n=>({numeri:n}))},rows=generate(hist,5),actual=new Set(draws[i]);
   tests+=rows.length;
   rows.forEach(row=>{const h=row.numeri.filter(n=>actual.has(n)).length;total+=h;if(h>=2)hit2++;if(h>=3)hit3++;if(h>=4)hit4++;if(h>=5)hit5++;max=Math.max(max,h)});
   for(let b=0;b<5;b++)baseTotal+=randomCombo().filter(n=>actual.has(n)).length;
 }
 const avg=tests?total/tests:0,baselineAvg=tests?baseTotal/tests:0;
 return {draws:draws.length-15,avg,hit2:tests?hit2/tests:0,hit3:tests?hit3/tests:0,hit4:tests?hit4/tests:0,hit5:tests?hit5/tests:0,max,baselineAvg,lift:baselineAvg?avg/baselineAvg:0};
}
function build(data){return{
 profiles:[["integrata","LAB 6 — Motore unico","Statistica multi-finestra + co-occorrenze normalizzate + simulazione + backtest + diversificazione."]],
 generate:(mode,n)=>generate(data,n),
 simulate:(mode,n)=>simulate(data,n||20000),
 backtest:(mode)=>backtest(data)
}}
window.LAB6Math={build,comboStats:function(nums){const s=[...nums].sort((a,b)=>a-b);return{sum:s.reduce((a,b)=>a+b,0),odd:s.filter(x=>x%2).length,low:s.filter(x=>x<=45).length,consecutive:s.slice(1).filter((x,i)=>x-s[i]===1).length,decades:new Set(s.map(x=>Math.floor((x-1)/10))).size,span:s[5]-s[0]}},choose,comboProb};
})();