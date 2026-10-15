// Author: CA
export function nativeBuildCandidate(mode,edgeCount){return ['ergo','recoil','balanced'].includes(mode)&&Number.isSafeInteger(edgeCount)&&edgeCount>=2000;}
export function useNativeBuildSearch(mode,edgeCount){
 return ['ergo','balanced'].includes(mode)&&Number.isSafeInteger(edgeCount)&&edgeCount>=2000;
}
