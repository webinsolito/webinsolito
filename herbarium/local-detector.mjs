export const DETECTOR_STATUS=Object.freeze({UNKNOWN:'UNKNOWN',REJECT:'REJECT'});
export const DEFAULT_NON_PLANT_THRESHOLD=0.985;

const unknown=reason=>({status:DETECTOR_STATUS.UNKNOWN,negativeCategory:null,reason});

/**
 * Conservative contract for a future local pixel model.
 * The adapter MUST execute inference on decoded image pixels locally and return
 * { executed:true, nonPlantScore:0..1, category?:string }.
 * Missing runtime, errors, ambiguity and malformed outputs always remain UNKNOWN.
 */
export async function classifyPixelsLocally(pixelSource, adapter, {threshold=DEFAULT_NON_PLANT_THRESHOLD}={}) {
  if(!pixelSource) return unknown('no-pixels');
  if(!adapter || typeof adapter.infer!=='function') return unknown('runtime-unavailable');
  if(!Number.isFinite(threshold) || threshold<=0.5 || threshold>1) return unknown('invalid-threshold');
  try {
    const result=await adapter.infer(pixelSource);
    if(!result || result.executed!==true) return unknown('inference-not-executed');
    const score=Number(result.nonPlantScore);
    if(!Number.isFinite(score) || score<0 || score>1) return unknown('invalid-output');
    if(score<threshold) return unknown('ambiguous');
    const category=typeof result.category==='string'&&result.category.trim()?result.category.trim():'non-plant';
    return {status:DETECTOR_STATUS.REJECT,negativeCategory:category,reason:'local-pixel-inference'};
  } catch {
    return unknown('inference-error');
  }
}
