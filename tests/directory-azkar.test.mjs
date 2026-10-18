import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateDirectoryMember,saveDirectoryMember} from '../directory-service.mjs';
import {directoryCandidate} from '../scripts/security/directory-candidate.mjs';

test('merged candidate adds only the reviewed directory block and leaves the deployment guard closed',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
 const base=read('../firestore.rules'),fragment=read('../rules/directory-overlay.fragment.rules'),candidate=directoryCandidate();
 assert.equal(candidate,read('../rules/firestore.directory-candidate.rules'));
 assert.equal(candidate.replace(fragment+'\n',''),base);
 assert.equal(JSON.parse(read('../firebase.json')).firestore.rules,'firestore.rules');
 const config={window:{}};vm.runInNewContext(read('../session-config.js'),config);
 assert.equal(config.window.__WA3I_SESSION_CONFIG.directoryWritesEnabled,true);
 assert.equal(config.window.__WA3I_SESSION_CONFIG.adminUid,'OpXzKToeVbd9xp1KHuqnD95yXlm2');
 assert.equal(config.window.__WA3I_SESSION_CONFIG.officialLaunchDate,'2026-10-16');
 assert.equal(config.window.__WA3I_SESSION_CONFIG.publicBracelets,false);
});

test('directory is profile-only: stable IDs, no passwords or Auth calls, protected admin',async()=>{
 const member={memberId:'custom_member_directory_test',name:'عضو',src:'',active:true};
 assert.equal(validateDirectoryMember(member).memberId,member.memberId);
 for(const patch of [{memberId:'member_9'},{src:'javascript:alert(1)'},{src:'data:image/svg+xml,<svg/>'},{name:''}])assert.throws(()=>validateDirectoryMember({...member,...patch}));
 await assert.rejects(saveDirectoryMember({enabled:false}),/RULES_APPROVAL/);
 const source=readFileSync(new URL('../directory-service.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/createUser|deleteUser|password|accountBindings|memberAccounts/);
 const candidate=directoryCandidate();assert.match(candidate,/match \/directoryMembers/);assert.equal((candidate.match(/match \/\{document=\*\*\}/g)||[]).length,1);
 assert.match(candidate,/allow delete: if false/);assert.match(candidate,/request\.resource\.data\.revision == resource\.data\.revision \+ 1/);
});
test('four sanitized archive categories preserve counts and do not alter morning or evening data',()=>{
 const extra=JSON.parse(readFileSync(new URL('../azkar-extra.json',import.meta.url),'utf8'));
 assert.deepEqual(extra.categories.map(c=>[c.key,c.items.length]),[['waking',3],['sleep',15],['after-prayer',11],['tasbeeh',17]]);
 assert.equal(extra.categories[0].title,'أذكار الاستيقاظ من النوم');
 assert.ok(extra.categories[0].items[0].content.includes('أَحْـيانا'));
 assert.equal(extra.categories[1].items[2].count_description,'ثلاث مرات');
 assert.equal(extra.categories[1].items[7].count_description,''); // No invented count for an empty source cell.
 for(const c of extra.categories){
   assert.match(c.sourceSha256,/^[a-f0-9]{64}$/);assert.match(c.sourceUrl,/^https:\/\/www.islambook.com\/AzkarPrint\/\d+$/);
   assert.equal(new Set(c.items.map(i=>i.content)).size,c.items.length);
   for(const item of c.items){assert.ok(item.content.trim());assert.doesNotMatch(item.content,/<script|<iframe|<img|<style/i);assert.equal(typeof item.count_description,'string');}
 }
 const scope={window:{}};vm.runInNewContext(readFileSync(new URL('../azkar-data.js',import.meta.url),'utf8'),scope);
 assert.ok(scope.window.AZKAR_DATA.morning.length>10&&scope.window.AZKAR_DATA.evening.length>10);
});
