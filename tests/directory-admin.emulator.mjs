import assert from 'node:assert/strict';
import {assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {saveDirectoryMember,deleteDirectoryMember} from '../directory-service.mjs';

export async function checkDirectoryAdmin({fs,db,auth,adminUid,otherDb,guestDb,environment}) {
  const id='custom_member_directory_emulator_check',member={memberId:id,name:'اختبار دليل',src:'data:image/png;base64,aGVsbG8='};
  const sdk={...fs,db,auth},session={state:'member',session:{isAdmin:true}};
  await assert.rejects(saveDirectoryMember({fs:sdk,session,adminUid,enabled:false,member}),/RULES_APPROVAL/);
  await assert.rejects(saveDirectoryMember({fs:sdk,session:{state:'guest'},adminUid,enabled:true,member}),/ADMIN_REQUIRED/);
  await assert.rejects(deleteDirectoryMember({fs:sdk,session,adminUid,enabled:false,memberId:id}),/RULES_APPROVAL/);
  await assert.rejects(deleteDirectoryMember({fs:sdk,session:{state:'guest'},adminUid,enabled:true,memberId:id}),/ADMIN_REQUIRED/);
  await saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member});
  let snap=await fs.getDocFromServer(fs.doc(db,'directoryMembers',id));assert.equal(snap.data().revision,1);
  const publicDoc=await assertSucceeds(fs.getDocFromServer(fs.doc(guestDb,'directoryMembers',id)));
  assert.deepEqual(Object.keys(publicDoc.data()).sort(),['memberId','name','revision','schemaVersion','src','updatedAt']);
  await saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member:{...member,name:'اسم معدل'},expectedRevision:1});
  assert.equal((await fs.getDocFromServer(fs.doc(db,'directoryMembers',id))).data().name,'اسم معدل');
  await assert.rejects(saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member,expectedRevision:1}),/CONFLICT/);
  const record={schemaVersion:2,...member,revision:1,updatedAt:fs.serverTimestamp()};
  await assertFails(fs.setDoc(fs.doc(otherDb,'directoryMembers',id+'x'),{...record,memberId:id+'x'}));
  await assertFails(fs.setDoc(fs.doc(guestDb,'directoryMembers',id+'x'),{...record,memberId:id+'x'}));
  for(const deniedDb of [guestDb,otherDb]){
    await assertFails(fs.updateDoc(fs.doc(deniedDb,'directoryMembers',id),{name:'تزوير',revision:3,updatedAt:fs.serverTimestamp()}));
    await assertFails(fs.deleteDoc(fs.doc(deniedDb,'directoryMembers',id)));
    await assertFails(fs.getDocFromServer(fs.doc(deniedDb,'plannerMembers',adminUid,'records','catalog')));
    await assertFails(fs.getDocFromServer(fs.doc(deniedDb,'accountBindings',adminUid)));
  }
  await assertFails(fs.setDoc(fs.doc(db,'directoryMembers','member_9'),{...record,memberId:'member_9'}));
  await assertFails(fs.deleteDoc(fs.doc(db,'directoryMembers','member_9')));
  for(const field of ['email','password','uid','permissions','authToken','active','hidden','ahdId'])
    await assertFails(fs.setDoc(fs.doc(db,'directoryMembers',id+'x'),{...record,memberId:id+'x',[field]:'forbidden'}));
  await assertFails(fs.updateDoc(fs.doc(db,'directoryMembers',id),{revision:99,updatedAt:fs.serverTimestamp()}));
  await saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member:{...member,name:'اسم معدل',src:'data:image/png;base64,dXBkYXRlZA=='},expectedRevision:2});
  const restored=await fs.getDocFromServer(fs.doc(db,'directoryMembers',id));
  assert.equal(restored.data().memberId,id);assert.equal(restored.data().name,'اسم معدل');assert.equal(restored.data().src,'data:image/png;base64,dXBkYXRlZA==');
  await assert.rejects(deleteDirectoryMember({fs:sdk,session,adminUid,enabled:true,memberId:id,expectedRevision:2}),/CONFLICT/);
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await fs.setDoc(fs.doc(db,'featuredMembers','custom__'+id),{type:'custom_member',memberId:id,name:'نسخة قديمة',src:member.src});
    await fs.setDoc(fs.doc(db,'featuredMembers','hidden__'+id),{type:'hidden_member',memberId:id});
    await fs.setDoc(fs.doc(db,'featuredMembers','custom__custom_member_wrong'),{type:'custom_member',memberId:'custom_member_different',name:'مختلف',src:''});
    await fs.setDoc(fs.doc(db,'featuredMembers','access__'+id),{type:'member_access',memberId:id});
  });
  for(const deniedDb of [guestDb,otherDb]){
    await assertFails(fs.deleteDoc(fs.doc(deniedDb,'featuredMembers','custom__'+id)));
    await assertFails(fs.deleteDoc(fs.doc(deniedDb,'featuredMembers','hidden__'+id)));
  }
  await assertFails(fs.deleteDoc(fs.doc(db,'featuredMembers','custom__member_9')));
  await assertFails(fs.deleteDoc(fs.doc(db,'featuredMembers','custom__custom_member_wrong')));
  await assertFails(fs.deleteDoc(fs.doc(db,'featuredMembers','access__'+id)));
  await assertFails(fs.setDoc(fs.doc(db,'featuredMembers','custom__'+id),{type:'custom_member',memberId:id,name:'إعادة إنشاء',src:''}));
  await deleteDirectoryMember({fs:sdk,session,adminUid,enabled:true,memberId:id,expectedRevision:3});
  assert.equal((await fs.getDocFromServer(fs.doc(db,'directoryMembers',id))).exists(),false);
  assert.equal((await fs.getDocFromServer(fs.doc(guestDb,'directoryMembers',id))).exists(),false);
  assert.equal((await fs.getDocFromServer(fs.doc(db,'featuredMembers','custom__'+id))).exists(),false);
  assert.equal((await fs.getDocFromServer(fs.doc(db,'featuredMembers','hidden__'+id))).exists(),false);
  await assert.rejects(saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member,expectedRevision:3}),/CONFLICT/);
  await assertFails(fs.setDoc(fs.doc(db,'accountBindings','forged'),{memberId:id}));
  const category={type:'qa_category',categoryId:'directory_admin_check',name:'اختبار إدارة',sortKey:1,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()};
  await assertSucceeds(fs.setDoc(fs.doc(db,'featuredMembers','qa_category__directory_admin_check'),category));
  await assertSucceeds(fs.deleteDoc(fs.doc(db,'featuredMembers','qa_category__directory_admin_check')));
  const book={type:'library_book',bookId:'directory_admin_check',title:'كتاب تجريبي',href:'https://example.com/book.pdf',createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()};
  await assertSucceeds(fs.setDoc(fs.doc(db,'libraryBooks','book__directory_admin_check'),book));
  await assertSucceeds(fs.deleteDoc(fs.doc(db,'libraryBooks','book__directory_admin_check')));
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await fs.deleteDoc(fs.doc(db,'featuredMembers','custom__custom_member_wrong'));
    await fs.deleteDoc(fs.doc(db,'featuredMembers','access__'+id));
  });
  console.log('DIRECTORY_ADMIN_EMULATOR_PASSED: add/name/photo/permanent-delete/CAS, no Auth/Ahd coupling, public fields, access controls, QA/library');
}
