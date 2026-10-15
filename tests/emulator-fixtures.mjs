import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import * as fs from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
export const projectId='demo-wa3i-performance';
export async function fixtures(){
  if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:5377'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:5376')throw Error('EMULATOR_ONLY');
  const apps=[],members=[];const password=randomBytes(24).toString('base64url')+'Aa1!';
  for(let index=0;index<3;index++){
    const id=index===2?'member_9':'custom_member_new_'+String(index+1).repeat(32);
    const email=index===2?'admin@review.wa3i.test':`m-${createHash('sha256').update(id).digest('hex').slice(0,24)}@members.wa3i.test`;
    const app=initializeApp({projectId,apiKey:'emulator-only',authDomain:projectId+'.firebaseapp.com'},'fixture-'+randomBytes(4).toString('hex'));
    apps.push(app);const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:5376',{disableWarnings:true});
    const credential=await createUserWithEmailAndPassword(auth,email,password);
    const db=fs.getFirestore(app);fs.connectFirestoreEmulator(db,'127.0.0.1',5377);
    members.push({id,email,password,user:credential.user,uid:credential.user.uid,auth,db,name:index===2?'أمجد تجريبي':index===0?'عضو اختبار':'عضو ثانٍ',src:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"%3E%3Ccircle cx="40" cy="40" r="38" fill="%2321afa8"/%3E%3C/svg%3E'});
  }
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8').replaceAll('OpXzKToeVbd9xp1KHuqnD95yXlm2',members[2].uid);
  const environment=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:5377,rules}});
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const member of members){
      await fs.setDoc(fs.doc(db,'featuredMembers','custom__'+member.id),{type:'custom_member',memberId:member.id,name:member.name,src:member.src,schemaVersion:2,managementState:'ready'});
      if(member.id==='member_9')continue;
      await fs.setDoc(fs.doc(db,'accountBindings',member.uid),{schemaVersion:1,active:true,memberId:member.id,authValidAfter:0});
      await fs.setDoc(fs.doc(db,'memberAccounts',member.id),{schemaVersion:1,uid:member.uid});
      await fs.setDoc(fs.doc(db,'memberRegistry',member.id),{schemaVersion:1,active:true,memberId:member.id,source:'cloud'});
      await fs.setDoc(fs.doc(db,'memberPermissions',member.id),{qa:false,ahd:false,memberStatus:false});
    }
  });
  return {members,environment,fs,signInWithEmailAndPassword,signOut,async close(){await Promise.all(members.map(m=>fs.terminate(m.db)));await Promise.all(apps.map(deleteApp));await environment.cleanup();}};
}
