import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {validateDirectoryMember,saveDirectoryMember,deleteDirectoryMember} from '../directory-service.mjs';
import {directoryCandidate} from '../scripts/security/directory-candidate.mjs';
import {directoryCrudCandidate} from '../scripts/security/directory-crud-candidate.mjs';

test('approved permanent-delete release preserves the prior rules outside the directory scope',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
 const base=read('../firestore.rules'),fragment=read('../rules/directory-overlay.fragment.rules'),candidate=directoryCandidate();
 assert.equal(candidate,read('../rules/firestore.directory-candidate.rules'));
 assert.equal(directoryCrudCandidate(),base);
 assert.equal(createHash('sha256').update(candidate.replace(fragment+'\n','')).digest('hex'),'f41fd8338988c42fdfdba341da6b26ee487d710776a68ab136e233f403ab6a5c');
 assert.equal(JSON.parse(read('../firebase.json')).firestore.rules,'firestore.rules');
 const config={window:{}};vm.runInNewContext(read('../session-config.js'),config);
 assert.equal(config.window.__WA3I_SESSION_CONFIG.directoryWritesEnabled,true);
 assert.equal(config.window.__WA3I_SESSION_CONFIG.adminUid,'OpXzKToeVbd9xp1KHuqnD95yXlm2');
 assert.equal(config.window.__WA3I_SESSION_CONFIG.officialLaunchDate,'2026-10-16');
 assert.equal(config.window.__WA3I_SESSION_CONFIG.publicBracelets,false);
});

test('directory is profile-only: stable IDs, no passwords or Auth calls, protected admin',async()=>{
 const member={memberId:'custom_member_directory_test',name:'عضو',src:''};
 assert.equal(validateDirectoryMember(member).memberId,member.memberId);
 for(const patch of [{memberId:'member_9'},{src:'javascript:alert(1)'},{src:'data:image/svg+xml,<svg/>'},{name:''}])assert.throws(()=>validateDirectoryMember({...member,...patch}));
 await assert.rejects(saveDirectoryMember({enabled:false}),/RULES_APPROVAL/);
 await assert.rejects(deleteDirectoryMember({enabled:false}),/RULES_APPROVAL/);
 const source=readFileSync(new URL('../directory-service.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/createUser|deleteUser|password|accountBindings|memberAccounts/);
 const candidate=directoryCandidate();assert.match(candidate,/match \/directoryMembers/);assert.equal((candidate.match(/match \/\{document=\*\*\}/g)||[]).length,1);
 assert.match(candidate,/allow delete: if false/);assert.match(candidate,/request\.resource\.data\.revision == resource\.data\.revision \+ 1/);
});
test('approved delete release changes only directory CRUD/old public copy deletion',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
 const candidate=directoryCrudCandidate(),fragment=read('../rules/directory-crud.fragment.rules');
 assert.equal(candidate.replace(read('../rules/directory-legacy-delete.fragment.rules')+'\n','').replace(fragment,()=>read('../rules/directory-overlay.fragment.rules')),directoryCandidate());
 assert.match(fragment,/allow delete: if isAmjad\(\) && directoryId\(\)/);
 assert.doesNotMatch(fragment,/active|accountBindings|ahdMembers/);
 assert.match(fragment,/schemaVersion == 2/);
 const cleanup=read('../rules/directory-legacy-delete.fragment.rules');
 assert.match(cleanup,/resource.data.memberId != 'member_9'/);
 assert.doesNotMatch(cleanup,/allow (?:create|update|write|read)|access__|status__|accountBindings/);
 assert.equal(JSON.parse(read('../firebase.json')).firestore.rules,'firestore.rules');
 assert.equal(candidate,read('../firestore.rules'));
});
test('directory source ignores legacy lists and caches, and a removed record cannot fall back',()=>{
 const source=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/restoreManagedMember|confirmDirectoryHide|includeHidden|member-directory-hidden|wa3i_dynamic_member_directory_cache|wa3i_member_directory_custom|wa3i_member_directory_hidden/);
 const state={baseMembers:[{id:'member_9',name:'أمجد',src:'images/admin.png'}],directoryMembers:new Map(),legacyProfiles:new Map()};
 const scope={MEMBER_DIRECTORY_STATE:state,isLegacyRemovedStaticMemberId:()=>false,DEFAULT_MEMBER_AVATAR_SRC:'default',Map};
 vm.createContext(scope);
 vm.runInContext(source.slice(source.indexOf('function getAllMembersList()'),source.indexOf('function renderMembersSection()'))+';this.members=getAllMembersList;',scope);
 const id='custom_member_directory_removed';
 // Deliberately seed every previous fallback. None is a directory source anymore.
 state.remoteCustomMembers=new Map([[id,{id,name:'قديم',src:'images/old.png'}]]);
 state.localCustomMembers=state.remoteCustomMembers;
 state.directoryMembers.set(id,{name:'جديد',src:'images/new.png'});
 state.legacyProfiles.set(id,{id,name:'نسخة قديمة',src:'images/old.png'});
 assert.equal(scope.members().length,2);
 state.directoryMembers.delete(id);state.legacyProfiles.delete(id);
 assert.deepEqual(Array.from(scope.members(),m=>m.id),['member_9']);
 assert.match(source,/snapshot\.metadata\.fromCache\|\|snapshot\.metadata\.hasPendingWrites/);
 const service=readFileSync(new URL('../directory-service.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(service,/ahdMembers|deleteUser|memberPermissions|memberRegistry/);
 assert.match(service,/tx\.delete\(ref\)/);
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
