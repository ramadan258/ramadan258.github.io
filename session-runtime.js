(() => {
  'use strict';
  const base=new URL('./',document.currentScript.src),home=new URL('index.html?release=3751ad4ea4c98ff8',base).href;
  const config=window.__WA3I_SESSION_CONFIG,projectId=window.__WA3I_FIREBASE_CONFIG?.projectId;
  if(!config||!projectId)throw Error('CONFIG_REQUIRED');
  let epoch=0,pending=Promise.resolve(),store=null,formsPromise=null,pool=null,navigating=false;
  const listeners=new Set(),memory=new Map();
  const publicKeys=new Set(['wa3i_dynamic_member_directory_cache_v3','wa3i_member_directory_remote_cache_v1','wa3i_member_status_cache_v1','wa3i_qa_content_cache_v1','wa3i_ahd_members_cache_v1']);
  const formKeys=new Set(['wa3i_daily_report_state_v1','wa3i_daily_report_archive_v1','wa3i_ramadan_report_state_v1','wa3i_ramadan_report_archive_v1',
    'tribe_report_state_v2','tribe_reports_archive_v2','wa3i_slip_report_state_v1','wa3i_pulse_48_state_v1','wa3i_weekly_mirror_state_v1']);
  const privateKey=key=>formKeys.has(key)||Boolean(SESSION.session&&key.startsWith(`wa3i_${SESSION.session.member.id}_`));
  const cacheKey=key=>`wa3i-public-v2:${projectId}:${key}`;
  const guestNamespace=`wa3i-device-guest-v1:${encodeURIComponent(projectId)}:${encodeURIComponent(base.pathname)}`;
  const guestModeKey='wa3i-guest-session-v1:'+guestNamespace;
  let cloudPromise,authHandle,authModule,cloudLogin,cloudFormsReady,resolveGuest,guestPrepared;
  const guestReady=new Promise(resolve=>{resolveGuest=resolve;});
  const SESSION=window.WA3I_SESSION={session:null,permissions:new Map(),accounts:new Map(),storage:{
    getItem(key){
      if(privateKey(key))return store?.storage.getItem(key)??null;
      if(publicKeys.has(key)){try{return localStorage.getItem(cacheKey(key));}catch{}}
      return memory.get(key)||null;
    },
    setItem(key,value){
      if(privateKey(key)){if(!store)throw Error('PRIVATE_STORE_NOT_READY');store.storage.setItem(key,value);return;}
      if(publicKeys.has(key)){try{localStorage.setItem(cacheKey(key),String(value));}catch{}}
      memory.set(key,String(value));
    },
    removeItem(key){
      if(privateKey(key)){if(!store)throw Error('PRIVATE_STORE_NOT_READY');store.storage.removeItem(key);return;}
      if(publicKeys.has(key)){try{localStorage.removeItem(cacheKey(key));}catch{}}
      memory.delete(key);
    },
  }};
  SESSION.projectId=projectId;SESSION.guestNamespace=guestNamespace;
  function guestNotice(){
    if(!document.body)return;
    document.body.classList.toggle('guest-session',SESSION.session?.kind==='guest');
    let notice=document.getElementById('guestDeviceNotice');
    if(SESSION.session?.kind!=='guest'){notice?.remove();return;}
    if(!notice){notice=document.createElement('button');notice.type='button';notice.id='guestDeviceNotice';notice.className='guest-device-info';notice.textContent='ⓘ';notice.setAttribute('aria-label','معلومات حفظ بيانات الضيف');
      const information=document.createElement('p');information.id='guestStorageInformation';information.setAttribute('popover','auto');information.className='guest-storage-information';
      information.textContent='بياناتك على هذا الجهاز فقط، وقد تُفقد عند مسح بيانات المتصفح.';
      document.getElementById(information.id)?.remove();document.body.append(information);notice.setAttribute('popovertarget',information.id);
      const anchor=document.querySelector('#reportWindow .window-footer')||document.querySelector('#accountLabel')?.parentElement||document.querySelector('[data-current-user-pill]')?.parentElement||document.querySelector('.member-canvas-hub');
      if(anchor?.matches('.member-canvas-hub,button'))anchor.after(notice);else if(anchor)anchor.append(notice);
    }
  }
  function activateGuest(){
    SESSION.session={uid:'local-guest',kind:'guest',isAdmin:false,permissions:{qa:false,memberStatus:false,ahd:false},member:{id:'guest',name:'ضيف',kind:'guest'}};
    guestNotice();document.body?.classList.remove('session-pending');resolveGuest(SESSION);
  }
  SESSION.formsReady=async()=>{
    if(SESSION.session?.kind!=='guest'){await startCloud();return cloudFormsReady();}
    if(!store){
      const generation=epoch,assert=()=>{if(generation!==epoch||SESSION.session?.kind!=='guest')throw Error('STALE_SESSION');};
      store={storage:{
        getItem(key){assert();return localStorage.getItem(guestNamespace+':forms:'+encodeURIComponent(key));},
        setItem(key,value){assert();localStorage.setItem(guestNamespace+':forms:'+encodeURIComponent(key),String(value));},
        removeItem(key){assert();localStorage.removeItem(guestNamespace+':forms:'+encodeURIComponent(key));},
      },flush:async()=>assert(),hasPending:()=>false,close:()=>{}};
    }
    return store;
  };
  function showSaveState(state){
    let status=document.getElementById('sessionSaveState');
    if(!status&&document.body){status=document.createElement('div');status.id='sessionSaveState';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);}
    if(!status)return;
    status.hidden=!state.pending&&!state.error;status.dataset.error=Boolean(state.error);
    status.textContent=state.error==='CONFLICT'?'تغيّرت البيانات في جلسة أخرى. احتفظ بتعديلاتك قبل إعادة التحميل.':state.error?'لم يكتمل الحفظ. لا تغادر الصفحة.':'جارٍ حفظ التعديلات…';
  }
  function clearPrivateState(){
    epoch++;SESSION.planner?.close();SESSION.planner=null;store?.close();store=null;formsPromise=null;guestPrepared=null;
    pool?.close();pool=null;SESSION.session=null;SESSION.permissions.clear();SESSION.accounts.clear();memory.clear();
    for(const stop of listeners)stop();listeners.clear();document.body?.classList.add('session-pending');
    document.querySelectorAll('input:not([type=button]),textarea').forEach(input=>{input.value='';});
    window.dispatchEvent(new Event('wa3i-session-cleared'));
    guestNotice();
  }
  function warnUnsavedSessionEnd(){if(SESSION.hasPending())alert('انتهت صلاحية الجلسة وهناك تعديلات لم يكتمل حفظها. لن نعرضها لحساب آخر.');}
  const serialize=task=>{const next=pending.catch(()=>{}).then(task);pending=next.catch(()=>{});return next;};
  SESSION.flush=async()=>{if(store)await store.flush();if(SESSION.planner)await SESSION.planner.flush();};
  SESSION.hasPending=()=>Boolean(store?.hasPending()||SESSION.planner?.hasPending());
  SESSION.safeLeave=async()=>{try{await SESSION.flush();return true;}catch{alert('هناك تعديلات لم تُحفظ. لن نغادر الصفحة حتى يكتمل الحفظ.');return false;}};
  SESSION.enterGuest=()=>serialize(async()=>{
    if(!await SESSION.safeLeave())throw Error('UNSAVED_CHANGES');
    localStorage.getItem(guestNamespace+':planner:catalog');
    clearPrivateState();sessionStorage.setItem(guestModeKey,'active');
    if(authHandle?.currentUser)await authModule.signOut(authHandle);
    activateGuest();return SESSION.session;
  });
  SESSION.login=async(member,password)=>{await startCloud();return cloudLogin(member,password);};
  SESSION.loginByName=async(name,password)=>{
    await startCloud();const {findLoginMember}=await import(new URL('member-identity.mjs',base).href);
    const snap=await window.FB.getDocs(window.FB.query(window.FB.collection(window.FB.db,'featuredMembers'),window.FB.where('type','==','custom_member')));
    const member=findLoginMember(name,snap.docs.map(d=>d.data()));return cloudLogin({id:member.memberId},password);
  };
  SESSION.loginAdmin=async(email,password)=>{await startCloud();return cloudLogin({id:config.adminMemberId},password,email);};
  SESSION.logout=()=>serialize(async()=>{
    if(!await SESSION.safeLeave())return false;
    sessionStorage.removeItem(guestModeKey);clearPrivateState();
    if(authHandle)await authModule.signOut(authHandle);location.replace(home);return true;
  });
  window.ensureFirebase=async()=>{await startCloud();return window.FB;};
  window.scheduleFirebaseWarmup=()=>{void startCloud().catch(()=>{});};
  SESSION.cloudReady=()=>startCloud();
  window.addEventListener('beforeunload',event=>{if(SESSION.hasPending()){event.preventDefault();event.returnValue='';}});
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link||link.target==='_blank'||event.ctrlKey||event.metaKey||event.shiftKey||event.button||!SESSION.hasPending())return;
    const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.hash&&url.pathname===location.pathname)return;
    event.preventDefault();if(navigating)return;navigating=true;
    void SESSION.safeLeave().then(ok=>{if(ok)location.href=url.href;}).finally(()=>{navigating=false;});
  },true);
  function startCloud(){return cloudPromise||=(async()=>{
    const [authMod,fs,{createServerReadPool},{verifySession},{guardCloudWrites}]=await Promise.all([
      import(new URL('vendor/firebase-auth-WHD5E6JR.js',base).href),import(new URL('vendor/firebase-data-O3EMFKE2.js',base).href),
      import(new URL('client/server-read-pool-ZXNZXRQP.js',base).href),import(new URL('client/verify-session-5NFAPO2B.js',base).href),
      import(new URL('client/cloud-write-guard-XIFAIFIE.js',base).href),
    ]);
    const app=authMod.initializeApp(window.__WA3I_FIREBASE_CONFIG,'wa3i-secure-v1');
    const auth=authMod.getAuth(app),db=fs.initializeFirestore(app,{experimentalAutoDetectLongPolling:true});
    authHandle=auth;authModule=authMod;
    
    await authMod.setPersistence(auth,authMod.browserSessionPersistence);
    window.FB={...guardCloudWrites(fs,()=>Boolean(SESSION.session&&SESSION.session.kind!=='guest')), ...authMod,auth,db,projectId,
      signInAnonymously:()=>{throw Error('ANONYMOUS_DISABLED');}};
    const publicTypes={custom__:'custom_member',hidden__:'hidden_member',qa_category__:'qa_category',qa_item__:'qa_item'};
    window.FB.publicBucketSnapshot=(prefixes,next,error=()=>{})=>{
      if(!prefixes.length||prefixes.some(prefix=>!publicTypes[prefix]))throw Error('PUBLIC_QUERY_SCOPE_REQUIRED');
      return fs.onSnapshot(fs.query(fs.collection(db,'featuredMembers'),fs.and(fs.where('type','in',[...new Set(prefixes.map(prefix=>publicTypes[prefix]))]),
        fs.or(...prefixes.map(prefix=>fs.and(fs.where(fs.documentId(),'>=',prefix),fs.where(fs.documentId(),'<=',prefix+'\uf8ff')))))),next,error);
    };
    window.ensureFirebase=async()=>window.FB;window.scheduleFirebaseWarmup=()=>{};
    cloudFormsReady=async()=>{
      if(store)return store;if(!SESSION.session)throw Error('AUTH_REQUIRED');
      if(formsPromise)return formsPromise;
      const generation=epoch,session=SESSION.session,current=()=>generation===epoch&&auth.currentUser?.uid===session.uid&&SESSION.session?.uid===session.uid;
      formsPromise=(async()=>{
        const {createPrivateStore}=await import(new URL('client/private-store-YXLH2JUX.js',base).href);
        if(!current())throw Error('STALE_SESSION');
        const value=await createPrivateStore({fs,db,uid:session.uid,memberId:session.member.id,isCurrent:current,onState:showSaveState});
        if(!current()){value.close();throw Error('STALE_SESSION');}store=value;return value;
      })();
      return formsPromise;
    };
    const hintKey=uid=>`wa3i-member-hint-v1:${projectId}:${uid}`;
    async function verify(memberId,generation=epoch){
      const user=auth.currentUser;if(SESSION.session?.kind==='guest'||!user||user.isAnonymous)throw Error('AUTH_REQUIRED');
      const current=()=>generation===epoch&&auth.currentUser?.uid===user.uid;
      if(!pool)pool=createServerReadPool({fs,db,isCurrent:current});
      let hintMemberId;try{hintMemberId=sessionStorage.getItem(hintKey(user.uid));}catch{}
      return verifySession({user,memberId,hintMemberId,adminUid:config.adminUid,adminMemberId:config.adminMemberId,
        staticMembers:config.staticMembers,dynamicMembers:config.dynamicMembers,read:pool.read,isCurrent:current});
    }
    function enter(session,generation){
      if(generation!==epoch)throw Error('STALE_SESSION');SESSION.session=session;
      try{sessionStorage.setItem(hintKey(session.uid),session.member.id);}catch{}
      watchSession(session);
      guestNotice();
    }
    function watchSession(session){
      const generation=epoch,current=()=>generation===epoch&&SESSION.session?.uid===session.uid;
      const invalid=()=>{if(current()){warnUnsavedSessionEnd();clearPrivateState();void serialize(async()=>{await authMod.signOut(auth);location.replace(home);});}};
      if(!session.isAdmin)for(const [collection,id,validate] of [
        ['accountBindings',session.uid,b=>b?.active&&b.memberId===session.member.id&&b.schemaVersion===1&&session.authTime>=b.authValidAfter],
        ['memberAccounts',session.member.id,a=>a?.uid===session.uid&&a.schemaVersion===1],
        ['memberRegistry',session.member.id,r=>r?.active&&r.memberId===session.member.id&&r.schemaVersion===1],
      ])listeners.add(pool.subscribe(collection,id,snapshot=>{if(current()&&!validate(snapshot.data()))invalid();},invalid));
      listeners.add(pool.subscribe('featuredMembers','custom__'+session.member.id,snapshot=>{
        if(!current())return;const profile=snapshot.data();
        if(!profile){if(config.staticMembers.some(member=>member.id===session.member.id))return;return invalid();}
        if(profile.memberId!==session.member.id)return invalid();
        if(config.dynamicMembers&&!session.isAdmin&&(profile.schemaVersion!==2||profile.managementState!=='ready'))return invalid();
        SESSION.session.member={id:session.member.id,name:profile.name,src:profile.src,kind:'member'};
        window.dispatchEvent(new Event('wa3i-permissions-changed'));
      },invalid));
      if(!session.isAdmin)listeners.add(pool.subscribe('featuredMembers','hidden__'+session.member.id,snapshot=>{if(current()&&snapshot.exists())invalid();},invalid));
      function account(snapshot){
        if(!current())return;SESSION.accounts.clear();const add=doc=>{if(doc.exists())SESSION.accounts.set(doc.id,doc.data());};
        if(session.isAdmin)snapshot.forEach(add);else add(snapshot);window.dispatchEvent(new Event('wa3i-permissions-changed'));
      }
      function permission(snapshot){
        if(!current())return;SESSION.permissions.clear();const add=doc=>{if(doc.exists())SESSION.permissions.set(doc.id,doc.data());};
        if(session.isAdmin)snapshot.forEach(add);else add(snapshot);
        const p=SESSION.permissions.get(session.member.id)||{};
        SESSION.session.permissions={qa:session.isAdmin||p.qa===true,memberStatus:session.isAdmin||p.memberStatus===true,ahd:session.isAdmin||p.ahd===true};
        window.dispatchEvent(new Event('wa3i-permissions-changed'));
      }
      if(session.isAdmin){
        listeners.add(fs.onSnapshot(fs.collection(db,'memberAccounts'),account,invalid));
        listeners.add(fs.onSnapshot(fs.collection(db,'memberPermissions'),permission,invalid));
      }else{
        listeners.add(pool.subscribe('memberAccounts',session.member.id,account,invalid));
        listeners.add(pool.subscribe('memberPermissions',session.member.id,permission,invalid));
      }
    }
    SESSION.verify=verify;
    const login=(member,password,email)=>serialize(async()=>{
      if(!await SESSION.safeLeave())throw Error('UNSAVED_CHANGES');
      sessionStorage.removeItem(guestModeKey);clearPrivateState();const generation=epoch;await authMod.signOut(auth);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(member.id));
      const slug=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
      try{await authMod.signInWithEmailAndPassword(auth,email||`m-${slug}@members.wa3i.test`,password);
        const session=await verify(member.id,generation);enter(session,generation);return session;
      }catch(error){clearPrivateState();await authMod.signOut(auth);
        throw Error(String(error.code||(/^[A-Z_]+$/.test(error.message||'')?error.message:'LOGIN_REJECTED')));}
      finally{password='';document.body.classList.remove('session-pending');}
    });
    cloudLogin=login;
    await new Promise(resolve=>{const stop=authMod.onAuthStateChanged(auth,()=>{stop();resolve();});});
    if(SESSION.session?.kind==='guest'){if(auth.currentUser)await authMod.signOut(auth);}
    else if(auth.currentUser){const generation=epoch;try{const session=await verify(undefined,generation);if(generation===epoch)enter(session,generation);}
      catch{if(generation===epoch){clearPrivateState();await authMod.signOut(auth);}}}
    authMod.onAuthStateChanged(auth,user=>{if(SESSION.session&&SESSION.session.kind!=='guest'&&user?.uid!==SESSION.session.uid){warnUnsavedSessionEnd();clearPrivateState();location.replace(home);}});
    return SESSION;
  })().catch(error=>{
    if(document.readyState!=='loading'){
      document.body?.classList.remove('session-pending');const grid=document.getElementById('identityGrid');if(grid&&SESSION.session?.kind!=='guest')grid.textContent='تعذر الاتصال. أعد المحاولة.';
    }
    throw error;
  });}
  try{if(sessionStorage.getItem(guestModeKey)==='active')activateGuest();}catch{}
  const startup=SESSION.session?.kind==='guest'?Promise.resolve(SESSION):Promise.race([startCloud(),guestReady]);
  const finishReady=async()=>{
    if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    if(document.body.hasAttribute('data-session-private-page')&&!SESSION.session){location.replace(home);throw Error('AUTH_REQUIRED');}
    if(document.body.hasAttribute('data-session-forms-page'))await SESSION.formsReady();
    document.body.classList.remove('session-pending');guestNotice();return SESSION;
  };
  const ready=startup.then(finishReady);
  Object.defineProperty(SESSION,'ready',{get:()=>SESSION.session?.kind==='guest'?guestPrepared||=finishReady():ready});
  ready.catch(()=>{});
  document.addEventListener('DOMContentLoaded',guestNotice,{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted){document.body.classList.add('session-pending');location.reload();}});
})();
