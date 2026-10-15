import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {verifySession} from '../verify-session.js';
import {createServerReadPool} from '../server-read-pool.js';
import {createServerBatchReader} from '../server-batch-read.js';
import {sessionFailure} from '../session-errors.mjs';
const id='custom_member_new_'+'a'.repeat(32),uid='wa3i-fictional';
const records={['accountBindings/'+uid]:{schemaVersion:1,active:true,memberId:id,authValidAfter:10},
 ['memberAccounts/'+id]:{schemaVersion:1,uid},['memberRegistry/'+id]:{schemaVersion:1,active:true,memberId:id,source:'cloud'},
 ['featuredMembers/custom__'+id]:{schemaVersion:2,managementState:'ready',memberId:id,name:'عضو اختبار',src:'local.svg'}};
const user={uid,isAnonymous:false,getIdToken:async()=>'fictional-emulator-token',getIdTokenResult:async()=>({claims:{auth_time:12},signInProvider:'password'})};
const verify=patch=>verifySession({user,read:async(c,id)=>records[c+'/'+id],staticMembers:[],adminUid:'admin-fictional',dynamicMembers:true,...patch});
test('server binding, not a browser hint, establishes membership',async()=>{
 assert.equal((await verify({hintMemberId:'someone-else'})).member.id,id);
 await assert.rejects(verify({memberId:'someone-else'}),/UNTRUSTED_ACCOUNT/);
 await assert.rejects(verify({read:async(c,i)=>c==='accountBindings'?{...records[c+'/'+i],active:false}:records[c+'/'+i]}),/UNTRUSTED_ACCOUNT/);
});
test('revocation and technical failure remain different',()=>{
 for(const code of ['unavailable','permission-denied','auth/network-request-failed'])assert.equal(sessionFailure({code}),'temporary');
 for(const message of ['UNTRUSTED_ACCOUNT','STALE_OR_INVALID_SESSION'])assert.equal(sessionFailure({message}),'invalid');
 assert.equal(sessionFailure({code:'auth/user-disabled'}),'invalid');
});
test('pool coalesces reads; starts one listener per path only after verification',async()=>{
 let reads=0,listens=0,current=true,fail=true;const callbacks=[];
 const snap={data:()=>({ok:true}),metadata:{fromCache:false,hasPendingWrites:false}};
 const pool=createServerReadPool({db:{},isCurrent:()=>current,fs:{doc:(_,c,id)=>c+'/'+id,onSnapshot:(_r,_o,next,error)=>{listens++;callbacks.push({next,error});return()=>{};}},
 getServerSnapshot:async()=>{reads++;if(fail)throw Error('unavailable');return snap;}});
 await assert.rejects(pool.read('a','b'));fail=false;
 await Promise.all([pool.read('a','b'),pool.read('a','b')]);assert.equal(reads,2);assert.equal(listens,0);
 const stop=pool.subscribe('a','b',()=>{}),stop2=pool.subscribe('a','b',()=>{});assert.equal(listens,1);
 stop();stop2();current=false;await assert.rejects(pool.read('a','b'),/STALE_SESSION/);pool.close();
});
test('REST bootstrap batches concurrent paths and uses Firebase token, not IAM',async()=>{
 let calls=0;const reader=createServerBatchReader({projectId:'demo-review',user,isCurrent:()=>true,request:async(url,options)=>{
   calls++;assert.match(url,/demo-review/);assert.equal(options.headers.Authorization,'Bearer fictional-emulator-token');
   const {documents}=JSON.parse(options.body);return {ok:true,json:async()=>documents.map(name=>({found:{name,fields:{active:{booleanValue:true}}}}))};
 }});
 const result=await Promise.all([reader('accountBindings',uid),reader('memberAccounts',id)]);
 assert.equal(calls,1);assert.equal(result[1].data().active,true);await assert.rejects(reader('privateMembers','someone'),/INVALID_SERVER_PATH/);
});
function runtime({signedIn=true,importFailure=false,dataImportFailure=false,readFailure=false}={}) {
 class Node extends EventTarget {constructor(){super();this.classList={add(){},remove(){},toggle(){}};this.style={};}setAttribute(){}hasAttribute(){return false;}append(){}remove(){}querySelector(){return null;}querySelectorAll(){return [];} }
 const document=new Node();document.body=new Node();document.readyState='complete';document.currentScript={src:'http://127.0.0.1/session-runtime.js'};document.getElementById=()=>null;document.createElement=()=>new Node();
 const window=new EventTarget();window.__WA3I_FIREBASE_CONFIG={projectId:'demo-review'};window.__WA3I_SESSION_CONFIG={adminUid:'admin-fictional',adminMemberId:'member_9',staticMembers:[],dynamicMembers:true};
 let signouts=0,imports=0;const streams=[];const auth={currentUser:signedIn?user:null,authStateReady:async()=>{}};
 const authMod={getApps:()=>[],initializeApp:()=>({}),getAuth:()=>auth,setPersistence:async()=>{},browserLocalPersistence:'local',onAuthStateChanged:()=>()=>{},signOut:async()=>{signouts++;auth.currentUser=null;}};
 const storage=()=>{const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,String(v)),removeItem:key=>data.delete(key)};};
 let reloads=0;const location={href:'http://127.0.0.1/index.html',reload(){reloads++;},replace(){}};
 const fakeFs={initializeFirestore:()=>({}),doc:(_db,c,id)=>c+'/'+id,onSnapshot:(path,_options,next,error)=>{streams.push({path,next,error});return()=>{};}};
 const __import=async url=>{
  const name=String(url);imports++;
  if(importFailure&&name.includes('firebase-auth')){importFailure=false;throw Error('NETWORK_IMPORT_FAILED');}
  if(name.includes('firebase-auth'))return authMod;
  if(name.includes('firebase-data')){if(dataImportFailure){dataImportFailure=false;throw Error('NETWORK_IMPORT_FAILED');}return fakeFs;}
  if(name.includes('server-read-pool'))return {createServerReadPool};
  if(name.includes('verify-session'))return {verifySession};
  if(name.includes('session-errors'))return {sessionFailure};
  if(name.includes('cloud-write-guard'))return {guardCloudWrites:fs=>fs};
  if(name.includes('server-batch-read'))return {createServerBatchReader:()=>async(c,id)=>{if(readFailure)throw Object.assign(Error('offline'),{code:'unavailable'});return {data:()=>records[c+'/'+id],exists:()=>Boolean(records[c+'/'+id])};}};
  throw Error('Unexpected module');
 };
 const timers=new Set();const context={window,document,location,navigator:{onLine:false},localStorage:storage(),sessionStorage:storage(),URL,Event,crypto:webcrypto,performance,console,
  alert(){},setTimeout(fn,ms){const timer=setTimeout(fn,ms);timers.add(timer);return timer;},clearTimeout,__import};
 vm.runInNewContext(readFileSync(new URL('../session-runtime.js',import.meta.url),'utf8').replaceAll('import(new URL','__import(new URL'),context);
 return {session:window.WA3I_SESSION,streams,auth,get signouts(){return signouts;},get reloads(){return reloads;},get imports(){return imports;},recover(){readFailure=false;},close(){timers.forEach(clearTimeout);}};
}
test('valid stored Auth restores without guest sign-out; streams suspend instead of destroying Auth',async()=>{
 const r=runtime();await r.session.ready;assert.equal(r.session.state,'member');assert.equal(r.signouts,0);
 const stream=r.streams.find(s=>s.path.startsWith('accountBindings/'));
 stream.error({code:'unavailable'});assert.equal(r.session.state,'suspended');assert.equal(r.signouts,0);assert.equal(r.auth.currentUser.uid,uid);r.close();
});
test('authoritative membership deactivation ends access',async()=>{
 const r=runtime();await r.session.ready;r.streams.find(s=>s.path.startsWith('accountBindings/')).next({metadata:{fromCache:false,hasPendingWrites:false},data:()=>({active:false})});
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(r.session.session,null);assert.equal(r.signouts,1);r.close();
});
test('rejected initialization promise can be retried, without duplicate Auth initialization',async()=>{
 const r=runtime({importFailure:true});await assert.rejects(r.session.ready);await r.session.retry();assert.equal(r.session.state,'suspended');assert.equal(r.signouts,0);r.close();
});
test('temporary verification failure keeps saved Firebase identity and hides private access',async()=>{
 const r=runtime({readFailure:true});await r.session.ready;assert.equal(r.session.state,'suspended');assert.equal(r.session.session,null);assert.equal(r.signouts,0);r.recover();await r.session.retry();assert.equal(r.signouts,0);assert.equal(r.reloads,1);r.close();
});

test('intentional guest switch signs out only after preserving pending work',async()=>{
 const r=runtime();await r.session.ready;let flushes=0;
 r.session.planner={flush:async()=>{flushes++;},close(){},hasPending:()=>true};
 await r.session.enterGuest();assert.equal(flushes,1);assert.equal(r.signouts,1);assert.equal(r.session.session.kind,'guest');assert.equal(r.session.permissions.size,0);r.close();
});
test('cloudPromise also resets after a Firestore module import failure',async()=>{
 const r=runtime({dataImportFailure:true});await assert.rejects(r.session.ready);await r.session.retry();assert.equal(r.signouts,0);assert.ok(r.session.verify);r.close();
});
