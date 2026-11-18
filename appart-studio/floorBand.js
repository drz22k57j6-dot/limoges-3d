export function floorBandTransform(floorY,floorHeight,baseHeight){
  const y=Number(floorY)||0,h=Math.max(0,Number(floorHeight)||0),base=Math.max(0.1,Number(baseHeight)||h||0.1);
  return {scaleY:h/base,centerY:y+h/2};
}
