import assert from 'node:assert/strict';
import {assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {saveDirectoryMember} from '../directory-service.mjs';

export async function checkDirectoryAdmin({fs,db,auth,adminUid,otherDb,guestDb,environment}) {
  const id='custom_member_directory_emulator_check',member={memberId:id,name:'اختبار دليل',src:'data:image/png;base64,aGVsbG8=',active:true};
  const sdk={...fs,db,auth},session={state:'member',session:{isAdmin:true}};
  await assert.rejects(saveDirectoryMember({fs:sdk,session,adminUid,enabled:false,member}),/RULES_APPROVAL/);
  await assert.rejects(saveDirectoryMember({fs:sdk,session:{state:'guest'},adminUid,enabled:true,member}),/ADMIN_REQUIRED/);
  await saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member});
  let snap=await fs.getDocFromServer(fs.doc(db,'directoryMembers',id));assert.equal(snap.data().revision,1);
  const publicDoc=await assertSucceeds(fs.getDocFromServer(fs.doc(guestDb,'directoryMembers',id)));
  assert.deepEqual(Object.keys(publicDoc.data()).sort(),['active','memberId','name','revision','schemaVersion','src','updatedAt']);
  await saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member:{...member,name:'اسم معدل'},expectedRevision:1});
  assert.equal((await fs.getDocFromServer(fs.doc(db,'directoryMembers',id))).data().name,'اسم معدل');
  await assert.rejects(saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member,expectedRevision:1}),/CONFLICT/);
  await fs.setDoc(fs.doc(db,'ahdMembers',id),{joinedAt:fs.serverTimestamp()});
  await saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member:{...member,active:false},expectedRevision:2});
  assert.equal((await fs.getDocFromServer(fs.doc(db,'directoryMembers',id))).data().active,false);
  assert.ok((await fs.getDocFromServer(fs.doc(db,'ahdMembers',id))).exists());
  const record={schemaVersion:1,...member,revision:1,updatedAt:fs.serverTimestamp()};
  await assertFails(fs.setDoc(fs.doc(otherDb,'directoryMembers',id+'x'),{...record,memberId:id+'x'}));
  await assertFails(fs.setDoc(fs.doc(guestDb,'directoryMembers',id+'x'),{...record,memberId:id+'x'}));
  for(const deniedDb of [guestDb,otherDb]){
    await assertFails(fs.updateDoc(fs.doc(deniedDb,'directoryMembers',id),{active:true,revision:4,updatedAt:fs.serverTimestamp()}));
    await assertFails(fs.deleteDoc(fs.doc(deniedDb,'directoryMembers',id)));
    await assertFails(fs.getDocFromServer(fs.doc(deniedDb,'plannerMembers',adminUid,'records','catalog')));
    await assertFails(fs.getDocFromServer(fs.doc(deniedDb,'accountBindings',adminUid)));
  }
  await assertFails(fs.setDoc(fs.doc(db,'directoryMembers','member_9'),{...record,memberId:'member_9'}));
  await assertFails(fs.deleteDoc(fs.doc(db,'directoryMembers',id)));
  for(const field of ['email','password','uid','permissions','authToken'])
    await assertFails(fs.setDoc(fs.doc(db,'directoryMembers',id+'x'),{...record,memberId:id+'x',[field]:'forbidden'}));
  await assertFails(fs.updateDoc(fs.doc(db,'directoryMembers',id),{revision:99,updatedAt:fs.serverTimestamp()}));
  await saveDirectoryMember({fs:sdk,session,adminUid,enabled:true,member:{...member,src:'data:image/png;base64,dXBkYXRlZA=='},expectedRevision:3});
  const restored=await fs.getDocFromServer(fs.doc(db,'directoryMembers',id));
  assert.equal(restored.data().memberId,id);assert.equal(restored.data().active,true);assert.equal(restored.data().src,'data:image/png;base64,dXBkYXRlZA==');
  await assertFails(fs.setDoc(fs.doc(db,'accountBindings','forged'),{memberId:id}));
  const category={type:'qa_category',categoryId:'directory_admin_check',name:'اختبار إدارة',sortKey:1,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()};
  await assertSucceeds(fs.setDoc(fs.doc(db,'featuredMembers','qa_category__directory_admin_check'),category));
  await assertSucceeds(fs.deleteDoc(fs.doc(db,'featuredMembers','qa_category__directory_admin_check')));
  const book={type:'library_book',bookId:'directory_admin_check',title:'كتاب تجريبي',href:'https://example.com/book.pdf',createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()};
  await assertSucceeds(fs.setDoc(fs.doc(db,'libraryBooks','book__directory_admin_check'),book));
  await assertSucceeds(fs.deleteDoc(fs.doc(db,'libraryBooks','book__directory_admin_check')));
  await fs.deleteDoc(fs.doc(db,'ahdMembers',id));
  await environment.withSecurityRulesDisabled(context=>fs.deleteDoc(fs.doc(context.firestore(),'directoryMembers',id)));
  console.log('DIRECTORY_ADMIN_EMULATOR_PASSED: add/edit/inactivate, stable ID/Ahd, public fields, access controls, QA/library');
}
