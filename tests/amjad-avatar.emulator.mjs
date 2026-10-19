import assert from 'node:assert/strict';
import {assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {saveDirectoryMember,deleteDirectoryMember} from '../directory-service.mjs';

export async function checkAmjadAvatar({fs,db,auth,adminUid,otherDb,guestDb,environment}) {
  const ref=fs.doc(db,'directoryMembers','member_9'),legacyRef=fs.doc(db,'featuredMembers','custom__member_9');
  const legacyBefore=(await fs.getDocFromServer(legacyRef)).data(),uidBefore=auth.currentUser.uid;
  const member={memberId:'member_9',name:'أمجد',src:'data:image/png;base64,aGVsbG8='};
  const record={schemaVersion:2,...member,revision:1,updatedAt:fs.serverTimestamp()};
  const options={fs:{...fs,db,auth},session:{state:'member',session:{isAdmin:true}},adminUid,enabled:true};
  for(const deniedDb of [guestDb,otherDb])await assertFails(fs.setDoc(fs.doc(deniedDb,'directoryMembers','member_9'),record));
  await saveDirectoryMember({...options,member});
  assert.equal((await assertSucceeds(fs.getDocFromServer(fs.doc(guestDb,'directoryMembers','member_9')))).data().src,member.src);
  const changed={...member,src:'data:image/jpeg;base64,dXBkYXRlZA=='};
  await saveDirectoryMember({...options,member:changed,expectedRevision:1});
  const saved=(await fs.getDocFromServer(ref)).data();
  assert.equal(saved.src,changed.src);assert.equal(saved.name,'أمجد');assert.equal(saved.memberId,'member_9');assert.equal(saved.revision,2);
  assert.deepEqual(Object.keys(saved).sort(),['memberId','name','revision','schemaVersion','src','updatedAt']);
  await assert.rejects(saveDirectoryMember({...options,member,expectedRevision:1}),/CONFLICT/);
  for(const patch of [{name:'اسم آخر'},{memberId:'member_99'},{schemaVersion:1},{uid:'forged'},{permissions:{ahd:true}},{active:false},{authValidAfter:0},{src:'javascript:alert(1)'},{src:'data:image/svg+xml,<svg/>'}])
    await assertFails(fs.updateDoc(ref,{...patch,revision:3,updatedAt:fs.serverTimestamp()}));
  for(const deniedDb of [guestDb,otherDb]){
    await assertFails(fs.updateDoc(fs.doc(deniedDb,'directoryMembers','member_9'),{src:member.src,revision:3,updatedAt:fs.serverTimestamp()}));
    await assertFails(fs.deleteDoc(fs.doc(deniedDb,'directoryMembers','member_9')));
  }
  await assertFails(fs.deleteDoc(ref));await assertFails(fs.deleteDoc(legacyRef));
  await assert.rejects(deleteDirectoryMember({...options,memberId:'member_9',expectedRevision:2}),/INVALID_DIRECTORY_MEMBER/);
  assert.equal(auth.currentUser.uid,uidBefore);assert.equal(uidBefore,adminUid);
  assert.deepEqual((await fs.getDocFromServer(legacyRef)).data(),legacyBefore);
  assert.equal((await fs.getDocFromServer(ref)).data().src,changed.src);
  await environment.withSecurityRulesDisabled(context=>fs.deleteDoc(fs.doc(context.firestore(),'directoryMembers','member_9')));
  console.log('AMJAD_AVATAR_EMULATOR_PASSED: photo create/update/public read, rename/delete/extra fields/unauthorized writes denied, legacy profile and UID unchanged');
}
