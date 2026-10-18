import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import vm from 'node:vm';

const root=resolve(process.argv[2]||'_site');
const forbidden=new Set(['scripts','tests','rules','docs','tools','node_modules','.review','.git','.github']);
const privateNames=new Set(['firebase.json','firebase.emulator.json','firestore.rules','package.json','package-lock.json','.firebaserc']);
let count=0;
function inspect(folder){
  for(const item of readdirSync(folder,{withFileTypes:true})){
    const path=resolve(folder,item.name),name=relative(root,path).replaceAll('\\','/');
    assert.ok(!forbidden.has(item.name)&&!privateNames.has(item.name),'Development file in Pages output: '+name);
    if(item.isDirectory()){inspect(path);continue;}
    assert.ok(!item.isSymbolicLink(),'Unexpected symlink: '+name);count++;
    if(!/\.(?:html|js|mjs|css|json|txt|svg)$/.test(item.name))continue;
    const source=readFileSync(path,'utf8');
    assert.doesNotMatch(source,/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|"private_key"\s*:\s*"|ya29\.[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|admin-[a-f0-9]{8}@review\.wa3i\.test|\/review-credentials/,'Secret/test fixture in output: '+name);
    // Legacy /pilot/ is retained unchanged; validate current root-page references only.
    if(!item.name.endsWith('.html')||dirname(path)!==root)continue;
    for(const match of source.matchAll(/(?:src|href)="([^"#]+)"/g)){
      const url=match[1];if(/^(?:[a-z]+:|\/\/)/i.test(url))continue;
      const target=decodeURIComponent(url.split(/[?#]/)[0]);if(!target)continue;
      const absolute=resolve(target.startsWith('/')?root:dirname(path),target.replace(/^\//,''));
      assert.ok(absolute===root||absolute.startsWith(root+'/')||absolute.startsWith(root+'\\'),'Asset escapes output');
      assert.ok(existsSync(absolute),'Missing published asset: '+name+' -> '+target);
    }
  }
}
for(const name of ['index.html','admin.html','khutay.html','daily_report.html','azkar.html','device-data.mjs','directory-service.mjs'])assert.ok(existsSync(resolve(root,name)),'Missing runtime file: '+name);
inspect(root);
const context={window:{}};vm.runInNewContext(readFileSync(resolve(root,'session-config.js'),'utf8'),context);
assert.equal(context.window.__WA3I_FIREBASE_CONFIG.projectId,'tribe-app-e3e9c');
assert.equal(context.window.__WA3I_SESSION_CONFIG.directoryWritesEnabled,true);
assert.equal(context.window.__WA3I_SESSION_CONFIG.adminUid,'OpXzKToeVbd9xp1KHuqnD95yXlm2');
assert.equal(context.window.__WA3I_SESSION_CONFIG.officialLaunchDate,'2026-10-16');
assert.equal(context.window.__WA3I_SESSION_CONFIG.publicBracelets,false);
assert.equal(context.window.__WA3I_SESSION_CONFIG.emulators,undefined);
console.log(JSON.stringify({pagesOutput:root,files:count,developmentFilesExcluded:true,secretScan:'passed',productionConfig:'verified'}));
