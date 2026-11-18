export function automaticWindowCount(facadeSpan,bayWidth=3.2){const span=Number(facadeSpan);if(!Number.isFinite(span)||span<=0)return 1;return Math.max(1,Math.min(8,Math.floor(span/bayWidth)));}
export function automaticWindowPositions(facadeSpan,count,edgeMargin=0.2){const span=Math.max(0,Number(facadeSpan)||0),n=Math.max(1,Math.min(8,Math.floor(Number(count)||1))),usable=Math.max(0,span-2*edgeMargin);return Array.from({length:n},(_,i)=>edgeMargin+usable*(i+0.5)/n);}
export function limitApartmentDepth(availableDepth,maxDepth=8,minDepth=1.5){const d=Number(availableDepth);if(!Number.isFinite(d)||d<minDepth)throw new Error('Profondeur disponible inférieure à '+minDepth+' m.');return Math.min(maxDepth,d);}
export function fractionWithinDay(nowMs,firstMs,lastMs,isToday){
  const first=Number(firstMs),last=Number(lastMs),now=Number(nowMs);
  if(!isToday||!Number.isFinite(first)||!Number.isFinite(last)||!Number.isFinite(now)||last<=first)return 0.5;
  return Math.max(0,Math.min(1,(now-first)/(last-first)));
}
