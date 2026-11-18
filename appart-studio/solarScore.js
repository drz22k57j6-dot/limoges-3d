// Score Soleil — score annuel lisible fondé sur le meilleur séjour, sinon la meilleure chambre.
export function scoreSoleil(rooms = []) {
  const living=rooms.filter(r=>r.type==='sejour');
  const bedrooms=rooms.filter(r=>r.type==='chambre');
  const candidates=living.length?living:bedrooms;
  if(!candidates.length) return {grade:null,winterHours:null,summerHours:null,room:null,roomType:null};
  const best=candidates.slice().sort((a,b)=>(b.hours?.winter||0)-(a.hours?.winter||0))[0];
  const h=Math.max(0,Number(best.hours?.winter)||0);
  const grade=h>=4?'A':h>=3?'B':h>=2?'C':h>=1?'D':h>=0.5?'E':h>0?'F':'G';
  return {grade,winterHours:h,summerHours:Math.max(0,Number(best.hours?.summer)||0),room:best.id,roomType:living.length?'sejour':'chambre'};
}
