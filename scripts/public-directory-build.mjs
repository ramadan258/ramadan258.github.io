import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parsePublicDirectorySnapshot,publicDirectorySnapshot} from '../public-directory-cache.mjs';
export const snapshotStart='<!-- public-directory-snapshot:start -->',snapshotEnd='<!-- public-directory-snapshot:end -->';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderPublicDirectorySnapshot(html,snapshot,projectId){
  const result=parsePublicDirectorySnapshot(snapshot,projectId),safe=publicDirectorySnapshot(result,projectId),members=new Map();
  for(const [id,row] of result.legacy)members.set(id,{id,name:row.name,src:row.src,source:'custom'});
  for(const [id,row] of result.directory)members.set(id,{id,name:row.name,src:row.src,source:'directory'});
  const rows=[...members.values()].sort((a,b)=>a.id==='member_9'?-1:b.id==='member_9'?1:0);
  const cards=rows.map((row,index)=>`<div class="slide-card" data-member-id="${escape(row.id)}" data-member-source="${row.source}" data-orig-index="${index}"><img src="${escape(row.src)}" alt="${escape(row.name)}" decoding="async" loading="eager"${index===0?' fetchpriority="high"':''}><h3>${escape(row.name)}</h3></div>`).join('');
  // Images already live in the server-rendered cards; do not double the HTML transfer.
  for(const source of ['directory','legacy'])for(const [,row] of safe[source])row.src='';
  const block=snapshotStart+'\n<script type="application/json" id="publicDirectorySnapshot">'+JSON.stringify(safe).replaceAll('<','\\u003c')+'</script>\n'+snapshotEnd;
  const start=html.indexOf(snapshotStart),end=html.indexOf(snapshotEnd);
  if(start<0||end<start)throw Error('PUBLIC_SNAPSHOT_MARKERS_MISSING');
  html=html.slice(0,start)+block+html.slice(end+snapshotEnd.length);
  const slider=/<div class="slider" aria-live="polite">[\s\S]*?<\/div>(?=\s*<\/div>\s*<div id="memberManageAdminSlot")/;
  if(!slider.test(html))throw Error('PUBLIC_SLIDER_MARKER_MISSING');
  return html.replace(slider,`<div class="slider" aria-live="polite">${cards}</div>`);
}
export function buildPublicDirectory(root=process.cwd()){
  const file=resolve(root,'public-directory-snapshot.json'),index=resolve(root,'index.html');
  const snapshot=JSON.parse(readFileSync(file,'utf8'));
  const result=renderPublicDirectorySnapshot(readFileSync(index,'utf8'),snapshot,'tribe-app-e3e9c');
  writeFileSync(index,result);
}
