(() => {
  'use strict';
  const base=new URL('./',document.currentScript.src),home=new URL('index.html?release=20261016-6c3e43d4cbbc',base).href;
  const config=window.__WA3I_SESSION_CONFIG,projectId=window.__WA3I_FIREBASE_CONFIG?.projectId;
  const adminMode=new URL(location.href).pathname.endsWith('/index.html')&&new URL(location.href).searchParams.get('admin')==='1';
  if(adminMode)document.documentElement.dataset.adminPage='true';
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
  const perf=window.WA3I_PERFORMANCE||{start(){},end(){},mark(){},duration(){}};
  let cloudPromise,authPromise,authHandle,authModule,cloudLogin,cloudFormsReady,resolveGuest,guestPrepared,dbHandle;
  let switching=false,retryTimer=null,retryAttempt=0,verification=null,adminDataPromise=null;
  const guestReady=new Promise(resolve=>{resolveGuest=resolve;});
  const SESSION=window.WA3I_SESSION={session:null,state:'restoring',permissions:new Map(),accounts:new Map(),storage:{
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
  SESSION.adminMode=adminMode;
  const emulators=location.hostname==='127.0.0.1'&&projectId.startsWith('demo-')?config.emulators:null;
  if(emulators)SESSION.emulatorBatchEndpoint=`http://127.0.0.1:${emulators.firestore}/v1/projects/${projectId}/databases/(default)/documents:batchGet`;
  SESSION.publicReady=document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve();
  function state(value){SESSION.state=value;document.body?.setAttribute('data-session-state',value);window.dispatchEvent(new Event('wa3i-session-state'));}
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
    state('guest');guestNotice();document.body?.classList.remove('session-pending');resolveGuest(SESSION);
  }
  SESSION.formsReady=async()=>{
    if(SESSION.session?.kind!=='guest'){await startCloud();return cloudFormsReady();}
    if(!store){
      const {activeNamespace}=await import(new URL('device-data.mjs',base).href);
      const active=activeNamespace(localStorage,guestNamespace);
      const generation=epoch,assert=()=>{if(generation!==epoch||SESSION.session?.kind!=='guest')throw Error('STALE_SESSION');};
      store={storage:{
        getItem(key){assert();return localStorage.getItem(active+':forms:'+encodeURIComponent(key));},
        setItem(key,value){assert();if(activeNamespace(localStorage,guestNamespace)!==active)throw Error('LOCAL_DATA_RESTORED_RELOAD_REQUIRED');localStorage.setItem(active+':forms:'+encodeURIComponent(key),String(value));},
        removeItem(key){assert();if(activeNamespace(localStorage,guestNamespace)!==active)throw Error('LOCAL_DATA_RESTORED_RELOAD_REQUIRED');localStorage.removeItem(active+':forms:'+encodeURIComponent(key));},
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
    epoch++;clearTimeout(retryTimer);retryTimer=null;adminDataPromise=null;SESSION.planner?.close();SESSION.planner=null;store?.close();store=null;formsPromise=null;guestPrepared=null;
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
    if(!adminMode){if(SESSION.session?.kind!=='guest')activateGuest();return SESSION.session;}
    localStorage.getItem(guestNamespace+':planner:catalog');
    switching=true;await startAuth();clearPrivateState();
    if(authHandle?.currentUser)await authModule.signOut(authHandle);
    switching=false;
    activateGuest();return SESSION.session;
  });
  SESSION.loginAdmin=async(email,password,options={})=>{if(!adminMode)throw Error('ADMIN_PAGE_REQUIRED');await startCloud();return cloudLogin({id:config.adminMemberId},password,email,options.remember!==false);};
  SESSION.logout=()=>serialize(async()=>{
    if(!await SESSION.safeLeave())return false;
    switching=true;clearPrivateState();
    if(authHandle)await authModule.signOut(authHandle);location.replace(home);return true;
  });
  SESSION.retry=async()=>{clearTimeout(retryTimer);retryTimer=null;await startCloud();if(SESSION.state==='suspended')await restoreSession();return SESSION;};
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
  function startAuth(){
    if(!adminMode)return Promise.reject(Error('ADMIN_PAGE_REQUIRED'));
    if(authPromise)return authPromise;
    perf.start('firebase-auth-modules');
    authPromise=(async()=>{
      const authMod=await import(new URL('vendor/firebase-auth-3MM5NKLE.js',base).href);
      perf.end('firebase-auth-modules');perf.start('firebase-auth-init');
      const app=authMod.getApps().find(app=>app.name==='wa3i-secure-v1')||authMod.initializeApp(window.__WA3I_FIREBASE_CONFIG,'wa3i-secure-v1');
      const auth=authMod.getAuth(app);authHandle=auth;authModule=authMod;
      if(emulators&&!auth.emulatorConfig)authMod.connectAuthEmulator(auth,`http://127.0.0.1:${emulators.auth}`,{disableWarnings:true});
      // Let Auth restore its saved persistence type; never promote a session-only login.
      perf.end('firebase-auth-init');perf.start('auth-restore');
      await auth.authStateReady();perf.end('auth-restore');
      authMod.onAuthStateChanged(auth,user=>{
        if(switching)return;
        if(SESSION.session?.kind==='member'&&user?.uid!==SESSION.session.uid){warnUnsavedSessionEnd();clearPrivateState();location.replace(home);}
        else if(adminMode&&SESSION.state==='guest'&&user&&!user.isAnonymous){clearPrivateState();location.reload();}
      });
      return {authMod,auth,app};
    })().catch(error=>{authPromise=null;throw error;});
    return authPromise;
  }
  async function restoreSession(){
    if(verification)return verification;
    verification=(async()=>{
      if(!authHandle.currentUser||authHandle.currentUser.isAnonymous){activateGuest();return;}
      const generation=epoch;
      try{const session=await SESSION.verify(undefined,generation);if(generation!==epoch)return;
        // A suspended view has already discarded its in-memory private store.
        if(SESSION.state==='suspended'){location.reload();return;}
        SESSION.enterVerified(session,generation);
      }catch(error){
        const {sessionFailure}=await import(new URL('session-errors.mjs',base).href);
        if(generation!==epoch||sessionFailure(error)==='stale')return;
        if(sessionFailure(error)==='invalid'){clearPrivateState();switching=true;await authModule.signOut(authHandle);switching=false;activateGuest();}
        else {state('suspended');showRetry();}
      }
    })().finally(()=>{verification=null;});return verification;
  }
  function showRetry(){
    void SESSION.publicReady.then(()=>{
      let banner=document.getElementById('sessionRetry');
      if(!banner){banner=document.createElement('div');banner.id='sessionRetry';banner.setAttribute('role','status');banner.textContent='تعذر التحقق من الاتصال مؤقتًا. ';
        const button=document.createElement('button');button.type='button';button.textContent='إعادة المحاولة';button.onclick=()=>{void SESSION.retry().catch(showRetry);};banner.append(button);document.body.append(banner);}
    });
    if(!retryTimer&&navigator.onLine!==false&&retryAttempt<5){retryTimer=setTimeout(()=>{retryTimer=null;retryAttempt++;void SESSION.retry().catch(showRetry);},Math.min(30000,1000*2**retryAttempt));}
  }
  function startCloud(){
    if(cloudPromise)return cloudPromise;
    perf.start('firebase-data-modules');
    cloudPromise=(async()=>{
    const [authMod,fs,{guardCloudWrites}]=await Promise.all([
      adminMode?startAuth().then(value=>value.authMod):null,import(new URL('vendor/firebase-data-DJK7N6GY.js',base).href),
      import(new URL('client/cloud-write-guard-37TOEH5T.js',base).href),
    ]);
    perf.end('firebase-data-modules');perf.start('firestore-init');
    const {app,auth}=adminMode?await startAuth():{app:fs.getApps().find(app=>app.name==='wa3i-public-v1')||fs.initializeApp(window.__WA3I_FIREBASE_CONFIG,'wa3i-public-v1'),auth:{currentUser:null}};
    if(!dbHandle){dbHandle=fs.initializeFirestore(app,{experimentalAutoDetectLongPolling:true});if(emulators)fs.connectFirestoreEmulator(dbHandle,'127.0.0.1',emulators.firestore);}
    const db=dbHandle;
    perf.end('firestore-init');
    if(adminMode){authHandle=auth;authModule=authMod;}
    
    window.FB={...guardCloudWrites(fs,()=>adminMode&&SESSION.state==='member'&&SESSION.session?.isAdmin===true), ...authMod,auth,db,projectId,
      signInAnonymously:()=>{throw Error('ANONYMOUS_DISABLED');}};
    const publicTypes={custom__:'custom_member',hidden__:'hidden_member',qa_category__:'qa_category',qa_item__:'qa_item'};
    window.FB.publicBucketSnapshot=(prefixes,next,error=()=>{},options={})=>{
      if(!prefixes.length||prefixes.some(prefix=>!publicTypes[prefix]))throw Error('PUBLIC_QUERY_SCOPE_REQUIRED');
      return fs.onSnapshot(fs.query(fs.collection(db,'featuredMembers'),fs.and(fs.where('type','in',[...new Set(prefixes.map(prefix=>publicTypes[prefix]))]),
        fs.or(...prefixes.map(prefix=>fs.and(fs.where(fs.documentId(),'>=',prefix),fs.where(fs.documentId(),'<=',prefix+'\uf8ff')))))),options,next,error);
    };
    if(!adminMode)return SESSION;
    const [{createServerReadPool},{verifySession},{createServerBatchReader}]=await Promise.all([
      import(new URL('client/server-read-pool-6CAVQ6TS.js',base).href),import(new URL('client/verify-session-HPHQATB6.js',base).href),import(new URL('server-batch-read.js',base).href)]);
    cloudFormsReady=async()=>{
      if(store)return store;if(!SESSION.session)throw Error('AUTH_REQUIRED');
      if(formsPromise)return formsPromise;
      const generation=epoch,session=SESSION.session,current=()=>generation===epoch&&auth.currentUser?.uid===session.uid&&SESSION.session?.uid===session.uid;
      formsPromise=(async()=>{
        const {createPrivateStore}=await import(new URL('client/private-store-6OES6RXD.js',base).href);
        if(!current())throw Error('STALE_SESSION');
        const value=await createPrivateStore({fs,db,uid:session.uid,memberId:session.member.id,isCurrent:current,onState:showSaveState});
        if(!current()){value.close();throw Error('STALE_SESSION');}store=value;return value;
      })().catch(error=>{formsPromise=null;throw error;});
      return formsPromise;
    };
    const hintKey=uid=>`wa3i-member-hint-v1:${projectId}:${uid}`;
    async function verify(memberId,generation=epoch){
      const user=auth.currentUser;if(SESSION.session?.kind==='guest'||!user||user.isAnonymous)throw Error('AUTH_REQUIRED');
      if(user.uid!==config.adminUid)throw Error('UNTRUSTED_ACCOUNT');
      const current=()=>generation===epoch&&auth.currentUser?.uid===user.uid;
      if(!pool)pool=createServerReadPool({fs,db,isCurrent:current,
        getServerSnapshot:createServerBatchReader({projectId,user,isCurrent:current,endpoint:SESSION.emulatorBatchEndpoint,onBatch:({ms})=>perf.duration('membership-batch',ms)}),
        onRead:()=>perf.mark('membership-server-read-complete')});
      let hintMemberId;try{hintMemberId=sessionStorage.getItem(hintKey(user.uid));}catch{}
      perf.start('membership-verify');
      try{return await verifySession({user,memberId,hintMemberId,adminUid:config.adminUid,adminMemberId:config.adminMemberId,
        staticMembers:config.staticMembers,dynamicMembers:config.dynamicMembers,read:pool.read,isCurrent:current});}
      finally{perf.end('membership-verify');}
    }
    function enter(session,generation){
      if(generation!==epoch)throw Error('STALE_SESSION');SESSION.session=session;
      state('member');retryAttempt=0;document.getElementById('sessionRetry')?.remove();
      try{sessionStorage.setItem(hintKey(session.uid),session.member.id);}catch{}
      watchSession(session);
      guestNotice();window.dispatchEvent(new Event('wa3i-session-ready'));
    }
    function watchSession(session){
      const generation=epoch,current=()=>generation===epoch&&SESSION.session?.uid===session.uid;
      const invalid=()=>{if(current()){warnUnsavedSessionEnd();clearPrivateState();state('invalid');void serialize(async()=>{switching=true;await authMod.signOut(auth);location.replace(home);});}};
      const interrupted=()=>{if(!current())return;
        // A stream/network failure is not proof of revoked identity. Lock private access, keep Auth.
        state('suspended');pool?.close();pool=null;listeners.clear();showRetry();
        window.dispatchEvent(new Event('wa3i-session-suspended'));
      };
      if(!session.isAdmin)for(const [collection,id,validate] of [
        ['accountBindings',session.uid,b=>b?.active&&b.memberId===session.member.id&&b.schemaVersion===1&&session.authTime>=b.authValidAfter],
        ['memberAccounts',session.member.id,a=>a?.uid===session.uid&&a.schemaVersion===1],
        ['memberRegistry',session.member.id,r=>r?.active&&r.memberId===session.member.id&&r.schemaVersion===1],
      ])listeners.add(pool.subscribe(collection,id,snapshot=>{if(current()&&!validate(snapshot.data()))invalid();},interrupted));
      listeners.add(pool.subscribe('featuredMembers','custom__'+session.member.id,snapshot=>{
        if(!current())return;const profile=snapshot.data();
        if(!profile){if(config.staticMembers.some(member=>member.id===session.member.id))return;return invalid();}
        if(profile.memberId!==session.member.id)return invalid();
        if(config.dynamicMembers&&!session.isAdmin&&(profile.schemaVersion!==2||profile.managementState!=='ready'))return invalid();
        SESSION.session.member={id:session.member.id,name:profile.name,src:profile.src,kind:'member'};
        window.dispatchEvent(new Event('wa3i-permissions-changed'));
      },interrupted));
      if(!session.isAdmin)listeners.add(pool.subscribe('featuredMembers','hidden__'+session.member.id,snapshot=>{if(current()&&snapshot.exists())invalid();},interrupted));
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
      if(!session.isAdmin){
        listeners.add(pool.subscribe('memberAccounts',session.member.id,account,interrupted));
        listeners.add(pool.subscribe('memberPermissions',session.member.id,permission,interrupted));
      }
    }
    SESSION.verify=verify;
    SESSION.enterVerified=enter;
    SESSION.adminDirectoryReady=()=>{
      if(SESSION.state!=='member'||!SESSION.session?.isAdmin)return Promise.reject(Error('ADMIN_REQUIRED'));
      const generation=epoch;
      return adminDataPromise||=(async()=>{
        const [accounts,permissions]=await Promise.all([fs.getDocsFromServer(fs.collection(db,'memberAccounts')),fs.getDocsFromServer(fs.collection(db,'memberPermissions'))]);
        if(generation!==epoch||SESSION.state!=='member'||!SESSION.session?.isAdmin)throw Error('STALE_SESSION');
        SESSION.accounts.clear();SESSION.permissions.clear();accounts.forEach(doc=>SESSION.accounts.set(doc.id,doc.data()));permissions.forEach(doc=>SESSION.permissions.set(doc.id,doc.data()));
      })().catch(error=>{adminDataPromise=null;throw error;});
    };
    const login=(member,password,email,remember=true)=>serialize(async()=>{
      if(!await SESSION.safeLeave())throw Error('UNSAVED_CHANGES');
      perf.start('password-login');
      switching=true;clearPrivateState();state('switching');const generation=epoch;await authMod.signOut(auth);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(member.id));
      const slug=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
      try{await authMod.setPersistence(auth,remember?authMod.browserLocalPersistence:authMod.browserSessionPersistence);
        await authMod.signInWithEmailAndPassword(auth,email||`m-${slug}@members.wa3i.test`,password);
        const session=await verify(member.id,generation);enter(session,generation);return session;
      }catch(error){clearPrivateState();await authMod.signOut(auth);activateGuest();
        throw Error(String(error.code||(/^[A-Z_]+$/.test(error.message||'')?error.message:'LOGIN_REJECTED')));}
      finally{switching=false;password='';document.body.classList.remove('session-pending');perf.end('password-login');}
    });
    cloudLogin=login;
    if(SESSION.state==='restoring')await restoreSession();
    return SESSION;
  })().catch(error=>{
    if(document.readyState!=='loading'){
      document.body?.classList.remove('session-pending');const grid=document.getElementById('identityGrid');if(grid&&SESSION.session?.kind!=='guest')grid.textContent='تعذر الاتصال. أعد المحاولة.';
    }
    cloudPromise=null;throw error;
  });return cloudPromise;}
  const startup=adminMode?(async()=>{
    await startAuth();
    if(authHandle.currentUser&&!authHandle.currentUser.isAnonymous)await startCloud();else activateGuest();
    return SESSION;
  })().catch(error=>{state('suspended');showRetry();throw error;}):(activateGuest(),Promise.resolve(SESSION));
  const finishReady=async()=>{
    if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    if(document.body.hasAttribute('data-session-private-page')&&!SESSION.session)throw Error('SESSION_UNVERIFIED');
    if(document.body.hasAttribute('data-session-forms-page'))await SESSION.formsReady();
    document.body.classList.remove('session-pending');guestNotice();return SESSION;
  };
  const ready=startup.then(finishReady);
  Object.defineProperty(SESSION,'ready',{get:()=>SESSION.session?.kind==='guest'?guestPrepared||=finishReady():ready});
  ready.catch(()=>{});
  document.addEventListener('DOMContentLoaded',guestNotice,{once:true});
  window.addEventListener('online',()=>{retryAttempt=0;if(SESSION.state==='suspended')void SESSION.retry().catch(showRetry);});
  window.addEventListener('pageshow',event=>{if(event.persisted&&SESSION.session?.kind==='member'){document.body.classList.add('session-pending');location.reload();}});
})();
