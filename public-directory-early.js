(() => {
  'use strict';
  const project=window.__WA3I_FIREBASE_CONFIG?.projectId;
  const key='wa3i-public-directory-removals-v1:'+project;
  const valid=id=>typeof id==='string'&&id!=='member_9'&&/^(member_[0-9]+|custom_member_[A-Za-z0-9_-]{1,100})$/.test(id);
  function read(){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)&&value.length<=500?value.filter(valid):[];}catch{return [];}}
  function remove(id){try{if(valid(id))localStorage.setItem(key,JSON.stringify([...new Set([...read(),id])].slice(-500)));}catch{}}
  window.WA3I_PUBLIC_DIRECTORY_REMOVALS={read,remove};
  if(window.WA3I_SESSION?.adminMode)return;
  const ids=read();if(!ids.length)return;
  const style=document.createElement('style');style.id='publicDirectoryRemovals';
  style.textContent=ids.map(id=>'#members [data-member-id="'+id+'"]{display:none!important}').join('\n');
  document.head.append(style);
})();
