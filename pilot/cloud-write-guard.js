export function guardCloudWrites(sdk,allowed) {
  const assertAllowed=()=>{if(!allowed())throw Error('GUEST_READ_ONLY');};
  const wrapWriter=writer=>{
    const proxy=new Proxy(writer,{get(target,key){
      const value=target[key];if(typeof value!=='function')return value;
      return (...args)=>{assertAllowed();const result=value.apply(target,args);return result===target?proxy:result;};
    }});return proxy;
  };
  // Methods on batches/transactions must also check the session at commit time.
  const guarded={...sdk};
  for(const name of ['addDoc','setDoc','updateDoc','deleteDoc'])if(sdk[name])guarded[name]=(...args)=>{assertAllowed();return sdk[name](...args);};
  if(sdk.writeBatch)guarded.writeBatch=(...args)=>{
    assertAllowed();const batch=sdk.writeBatch(...args);
    const proxy=new Proxy(batch,{get(target,key){const value=target[key];return typeof value==='function'?(...params)=>{
      assertAllowed();const result=value.apply(target,params);return result===target?proxy:result;
    }:value;}});return proxy;
  };
  if(sdk.runTransaction)guarded.runTransaction=(db,callback,options)=>{
    assertAllowed();return sdk.runTransaction(db,async transaction=>{
      assertAllowed();return callback(wrapWriter(transaction));
    },options);
  };
  return guarded;
}
