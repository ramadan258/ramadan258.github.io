const idOk=id=>typeof id==='string'&&/^(member_[0-9]+|custom_member_[A-Za-z0-9_-]{1,100})$/.test(id);
export function validateDirectoryMember(value) {
  if(!value||!idOk(value.memberId)||typeof value.name!=='string'||!value.name.trim()||value.name.length>80
    ||typeof value.src!=='string'||value.src.length>210000)throw Error('INVALID_DIRECTORY_MEMBER');
  if(value.memberId==='member_9'&&value.name!=='أمجد')throw Error('ADMIN_NAME_PROTECTED');
  if(value.src&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.src)&&!/^https:\/\/[^\s"<>]+$/.test(value.src)&&!/^images\/[A-Za-z0-9_./%-]+$/.test(value.src))throw Error('INVALID_DIRECTORY_IMAGE');
  return {memberId:value.memberId,name:value.name.trim(),src:value.src};
}
function requireDirectoryAdmin({fs,session,adminUid,enabled}) {
  if(!enabled)throw Error('DIRECTORY_RULES_APPROVAL_REQUIRED');
  const current=()=>session.state==='member'&&session.session?.isAdmin===true&&fs.auth.currentUser?.uid===adminUid;
  if(!current())throw Error('ADMIN_REQUIRED');
  return ()=>{if(!current())throw Error('ADMIN_REQUIRED');};
}
export async function saveDirectoryMember({fs,session,adminUid,enabled,member,expectedRevision}) {
  const check=requireDirectoryAdmin({fs,session,adminUid,enabled});
  const value=validateDirectoryMember(member),ref=fs.doc(fs.db,'directoryMembers',value.memberId);
  await fs.runTransaction(fs.db,async tx=>{
    check();
    const snapshot=await tx.get(ref),old=snapshot.exists()?snapshot.data():null,revision=old?.revision||0;
    if(revision!==(expectedRevision||0))throw Error('DIRECTORY_CONFLICT');
    check();
    tx.set(ref,{schemaVersion:2,...value,revision:revision+1,updatedAt:fs.serverTimestamp()});
  });
}
export async function deleteDirectoryMember({fs,session,adminUid,enabled,memberId,expectedRevision}) {
  const check=requireDirectoryAdmin({fs,session,adminUid,enabled});
  if(!idOk(memberId)||memberId==='member_9')throw Error('INVALID_DIRECTORY_MEMBER');
  const ref=fs.doc(fs.db,'directoryMembers',memberId),legacy=fs.doc(fs.db,'featuredMembers','custom__'+memberId),marker=fs.doc(fs.db,'featuredMembers','hidden__'+memberId);
  await fs.runTransaction(fs.db,async tx=>{
    check();
    const snapshot=await tx.get(ref),profile=await tx.get(legacy),hidden=await tx.get(marker);
    if((!snapshot.exists()&&!profile.exists())||(snapshot.exists()?snapshot.data().revision:0)!==expectedRevision)throw Error('DIRECTORY_CONFLICT');
    if(profile.exists()&&(profile.data().type!=='custom_member'||profile.data().memberId!==memberId)
      ||hidden.exists()&&(hidden.data().type!=='hidden_member'||hidden.data().memberId!==memberId))throw Error('INVALID_LEGACY_DIRECTORY_RECORD');
    // Erase old public directory copies in the same transaction, never related account/personal data.
    check();
    if(snapshot.exists())tx.delete(ref);
    if(profile.exists())tx.delete(legacy);
    if(hidden.exists())tx.delete(marker);
  });
}
