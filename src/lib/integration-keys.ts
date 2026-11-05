export type KeyLike={id:string,created_at:string,revoked_at:string|null}
/** Keys never expire; up to two active keys per environment allow rotation without downtime. */
export function keyRotationState<T extends KeyLike>(keys:T[]){const active=keys.filter(k=>!k.revoked_at).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));return {active,newestId:active.length>1?active[0].id:null,mode:active.length===0?'none' as const:active.length===1?'one' as const:'two' as const,canGenerate:active.length<2}}
