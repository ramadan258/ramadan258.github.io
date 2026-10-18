const idOk=id=>typeof id==='string'&&/^(member_[0-9]+|custom_member_[A-Za-z0-9_-]{1,100})$/.test(id);
export function validateDirectoryMember(value) {
  if(!value||!idOk(value.memberId)||value.memberId==='member_9'||typeof value.name!=='string'||!value.name.trim()||value.name.length>80
    ||typeof value.src!=='string'||value.src.length>210000||typeof value.active!=='boolean')throw Error('INVALID_DIRECTORY_MEMBER');
  if(value.src&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.src)&&!/^https:\/\/[^\s"<>]+$/.test(value.src)&&!/^images\/[A-Za-z0-9_./%-]+$/.test(value.src))throw Error('INVALID_DIRECTORY_IMAGE');
  return {memberId:value.memberId,name:value.name.trim(),src:value.src,active:value.active};
}
export async function saveDirectoryMember({fs,session,adminUid,enabled,member,expectedRevision}) {
  if(!enabled)throw Error('DIRECTORY_RULES_APPROVAL_REQUIRED');
  const current=()=>session.state==='member'&&session.session?.isAdmin===true&&fs.auth.currentUser?.uid===adminUid;
  if(!current())throw Error('ADMIN_REQUIRED');
  const value=validateDirectoryMember(member),ref=fs.doc(fs.db,'directoryMembers',value.memberId);
  await fs.runTransaction(fs.db,async tx=>{
    if(!current())throw Error('ADMIN_REQUIRED');
    const snapshot=await tx.get(ref),old=snapshot.exists()?snapshot.data():null,revision=old?.revision||0;
    if(revision!==(expectedRevision||0))throw Error('DIRECTORY_CONFLICT');
    if(!current())throw Error('ADMIN_REQUIRED');
    tx.set(ref,{schemaVersion:1,...value,revision:revision+1,updatedAt:fs.serverTimestamp()});
  });
}
