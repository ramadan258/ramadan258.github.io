(() => {
  'use strict';
  const base=new URL('./',document.currentScript.src),home=new URL('index.html',base).href,config=window.__WA3I_SESSION_CONFIG;
  if(!config||!window.__WA3I_FIREBASE_CONFIG)throw Error('CONFIG_REQUIRED');
  let epoch=0,pending=Promise.resolve(),store=null,navigating=false;
  const listeners=new Set(),publicMemory=new Map();
  const SESSION=window.WA3I_SESSION={session:null,permissions:new Map(),accounts:new Map(),storage:{
    getItem:key=>store?store.storage.getItem(key):publicMemory.get(key)||null,
    setItem:(key,value)=>{if(store)store.storage.setItem(key,value);else publicMemory.set(key,String(value));},
    removeItem:key=>{if(store)store.storage.removeItem(key);else publicMemory.delete(key);},
  }};
  function showSaveState(state){
    let status=document.getElementById('sessionSaveState');
    if(!status&&document.body){status=document.createElement('div');status.id='sessionSaveState';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);}
    if(!status)return;
    status.hidden=!state.pending&&!state.error;
    status.dataset.error=Boolean(state.error);
    status.textContent=state.error==='CONFLICT'?'تغيّرت البيانات في جلسة أخرى. احتفظ بتعديلاتك قبل إعادة التحميل.':state.error?
      'لم يكتمل الحفظ. لا تغادر الصفحة.':'جارٍ حفظ التعديلات…';
  }
  function clearPrivateState(){
    epoch++;SESSION.planner?.close();SESSION.planner=null;store?.close();store=null;SESSION.session=null;SESSION.permissions.clear();SESSION.accounts.clear();publicMemory.clear();
    listeners.forEach(stop=>stop());listeners.clear();document.body?.classList.add('session-pending');
    document.querySelectorAll('input:not([type=button]),textarea').forEach(input=>{input.value='';});
    window.dispatchEvent(new Event('wa3i-session-cleared'));
  }
  function warnUnsavedSessionEnd(){
    if(SESSION.hasPending())alert('انتهت صلاحية الجلسة وهناك تعديلات لم يكتمل حفظها. لن نعرضها لحساب آخر.');
  }
  const serialize=task=>{const next=pending.catch(()=>{}).then(task);pending=next.catch(()=>{});return next;};
  SESSION.flush=async()=>{if(store)await store.flush();if(SESSION.planner)await SESSION.planner.flush();};
  SESSION.hasPending=()=>Boolean(store?.hasPending()||SESSION.planner?.hasPending());
  SESSION.safeLeave=async()=>{
    try{await SESSION.flush();return true;}catch{alert('هناك تعديلات لم تُحفظ. لن نغادر الصفحة حتى يكتمل الحفظ.');return false;}
  };
  window.addEventListener('beforeunload',event=>{if(SESSION.hasPending()){event.preventDefault();event.returnValue='';}});
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link||link.target==='_blank'||event.ctrlKey||event.metaKey||event.shiftKey||event.button||!SESSION.hasPending())return;
    const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.hash&&url.pathname===location.pathname)return;
    event.preventDefault();if(navigating)return;navigating=true;
    void SESSION.safeLeave().then(ok=>{if(ok)location.href=url.href;}).finally(()=>{navigating=false;});
  },true);
  SESSION.ready=(async()=>{
    const [appMod,authMod,fs,{createPrivateStore},{verifySession}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'),import(new URL('private-store.js',base).href),import(new URL('verify-session.js',base).href),
    ]);
    const app=appMod.initializeApp(window.__WA3I_FIREBASE_CONFIG,'wa3i-secure-v1');
    const auth=authMod.getAuth(app);const db=fs.initializeFirestore(app,{experimentalForceLongPolling:true});
    await authMod.setPersistence(auth,authMod.browserSessionPersistence);
    window.FB={...fs,...authMod,auth,db,projectId:app.options.projectId};
    window.FB.publicBucketSnapshot=(prefixes,next,error=()=>{})=>{
      const buckets=new Map(),stops=[];
      for(const prefix of prefixes)stops.push(fs.onSnapshot(fs.query(fs.collection(db,'featuredMembers'),
        fs.where(fs.documentId(),'>=',prefix),fs.where(fs.documentId(),'<=',prefix+'\uf8ff')),snap=>{
          buckets.set(prefix,snap.docs);if(buckets.size!==prefixes.length)return;
          const docs=[...new Map([...buckets.values()].flat().map(doc=>[doc.id,doc])).values()];next({docs,forEach:fn=>docs.forEach(fn)});
        },error));
      return ()=>stops.forEach(stop=>stop());
    };
    delete window.FB.signInAnonymously;delete window.FB.createUserWithEmailAndPassword;
    window.ensureFirebase=async()=>window.FB;window.scheduleFirebaseWarmup=()=>{};
    async function verify(memberId,generation=epoch){
      const user=auth.currentUser;
      return verifySession({user,memberId,adminUid:config.adminUid,adminMemberId:config.adminMemberId,staticMembers:config.staticMembers,
        read:async(c,id)=>(await fs.getDocFromServer(fs.doc(db,c,id))).data(),isCurrent:()=>generation===epoch&&auth.currentUser?.uid===user?.uid});
    }
    async function enter(session,generation){
      SESSION.session=session;
      store=await createPrivateStore({fs,db,uid:session.uid,memberId:session.member.id,
        isCurrent:()=>epoch===generation&&auth.currentUser?.uid===session.uid&&SESSION.session?.uid===session.uid,onState:showSaveState});
      if(generation!==epoch)throw new Error('STALE_SESSION');watchSession(session);
    }
    function watchSession(session){
      const generation=epoch,current=()=>generation===epoch&&SESSION.session?.uid===session.uid;
      const invalid=()=>{if(current()){warnUnsavedSessionEnd();clearPrivateState();void serialize(async()=>{await authMod.signOut(auth);location.replace(home);});}};
      if(!session.isAdmin)for(const [collection,id,validate] of [
        ['accountBindings',session.uid,b=>b?.active&&b.memberId===session.member.id&&b.schemaVersion===1&&session.authTime>=b.authValidAfter],
        ['memberAccounts',session.member.id,a=>a?.uid===session.uid],['memberRegistry',session.member.id,r=>r?.active&&r.memberId===session.member.id],
      ])listeners.add(fs.onSnapshot(fs.doc(db,collection,id),snap=>{if(current()&&!validate(snap.data()))invalid();},invalid));
      listeners.add(fs.onSnapshot(fs.doc(db,'featuredMembers','custom__'+session.member.id),snap=>{
        if(!current())return;const p=snap.data();if(!p){if(config.staticMembers.some(m=>m.id===session.member.id))return;return invalid();}if(p.memberId!==session.member.id)return invalid();
        SESSION.session.member={id:session.member.id,name:p.name,src:p.src,kind:'member'};window.dispatchEvent(new Event('wa3i-permissions-changed'));
      },invalid));
      if(!session.isAdmin)listeners.add(fs.onSnapshot(fs.doc(db,'featuredMembers','hidden__'+session.member.id),snap=>{if(current()&&snap.exists())invalid();},invalid));
      const accountTarget=session.isAdmin?fs.collection(db,'memberAccounts'):fs.doc(db,'memberAccounts',session.member.id);
      listeners.add(fs.onSnapshot(accountTarget,snap=>{
        if(!current())return;SESSION.accounts.clear();const add=doc=>{if(doc.exists())SESSION.accounts.set(doc.id,doc.data());};
        if(session.isAdmin)snap.forEach(add);else add(snap);window.dispatchEvent(new Event('wa3i-permissions-changed'));
      },invalid));
      const target=session.isAdmin?fs.collection(db,'memberPermissions'):fs.doc(db,'memberPermissions',session.member.id);
      listeners.add(fs.onSnapshot(target,snap=>{
        if(!current())return;SESSION.permissions.clear();const add=doc=>{if(doc.exists())SESSION.permissions.set(doc.id,doc.data());};
        if(session.isAdmin)snap.forEach(add);else add(snap);const p=SESSION.permissions.get(session.member.id)||{};
        SESSION.session.permissions={qa:session.isAdmin||p.qa===true,memberStatus:session.isAdmin||p.memberStatus===true,ahd:session.isAdmin||p.ahd===true};window.dispatchEvent(new Event('wa3i-permissions-changed'));
      },invalid));
    }
    SESSION.verify=verify;
    const login=(member,password,email)=>serialize(async()=>{
      if(!await SESSION.safeLeave())throw new Error('UNSAVED_CHANGES');
      clearPrivateState();const generation=epoch;await authMod.signOut(auth);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(member.id));
      const slug=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
      try{await authMod.signInWithEmailAndPassword(auth,email||`m-${slug}@members.wa3i.test`,password);
        const session=await verify(member.id,generation);await enter(session,generation);return session;
      }catch(error){clearPrivateState();await authMod.signOut(auth);
        throw new Error(String(error.code||(/^[A-Z_]+$/.test(error.message||'')?error.message:'LOGIN_REJECTED')));}
      finally{password='';document.body.classList.remove('session-pending');}
    });
    SESSION.login=(member,password)=>login(member,password);
    SESSION.loginAdmin=(email,password)=>login({id:config.adminMemberId},password,email);
    SESSION.logout=()=>serialize(async()=>{
      if(!await SESSION.safeLeave())return false;
      clearPrivateState();await authMod.signOut(auth);location.replace(home);return true;
    });
    await new Promise(resolve=>{const stop=authMod.onAuthStateChanged(auth,()=>{stop();resolve();});});
    if(auth.currentUser){try{const session=await verify();await enter(session,epoch);}catch{clearPrivateState();await authMod.signOut(auth);}}
    authMod.onAuthStateChanged(auth,user=>{if(SESSION.session&&user?.uid!==SESSION.session.uid){warnUnsavedSessionEnd();clearPrivateState();location.replace(home);}});
    if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    if(document.body?.hasAttribute('data-session-private-page')&&!SESSION.session){location.replace(home);throw new Error('AUTH_REQUIRED');}
    document.body.classList.remove('session-pending');
    window.addEventListener('pageshow',event=>{if(event.persisted){document.body.classList.add('session-pending');location.reload();}});
    return SESSION;
  })().catch(error=>{
    if(document.readyState!=='loading'){
      document.body?.classList.remove('session-pending');const grid=document.getElementById('identityGrid');if(grid)grid.textContent='تعذر الاتصال. أعد المحاولة.';
    }
    throw error;
  });
})();
