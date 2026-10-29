// A confirmed write stays successful even if the following list refresh fails.
export function refreshAfterSave(refresh:()=>Promise<unknown>,onError:()=>void):void {
 void Promise.resolve().then(refresh).catch(onError);
}
export function mergeSavedRows<T extends {id:string;version:number}>(rows:T[],saved:T[]):T[] {
 const map=new Map(rows.map(r=>[r.id,r]));
 for(const r of saved)if(!map.has(r.id)||r.version>=map.get(r.id)!.version)map.set(r.id,r);
 return [...map.values()];
}
