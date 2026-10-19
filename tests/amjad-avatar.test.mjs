import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {amjadAvatarCandidate,amjadAvatarRulesHash} from '../scripts/security/directory-amjad-avatar-candidate.mjs';
import {directoryCrudCandidate} from '../scripts/security/directory-crud-candidate.mjs';
import {validateDirectoryMember,deleteDirectoryMember} from '../directory-service.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
test('approved avatar exception changes exactly one public directory document',()=>{
  const fragment=read('../rules/directory-amjad-avatar.fragment.rules'),candidate=amjadAvatarCandidate();
  assert.equal(candidate.replace(fragment+'\n',''),directoryCrudCandidate());
  assert.equal(read('../firestore.rules'),candidate);
  assert.equal(createHash('sha256').update(read('../firestore.rules')).digest('hex'),amjadAvatarRulesHash);
  assert.match(fragment,/match \/directoryMembers\/member_9/);
  assert.match(fragment,/affectedKeys\(\).hasOnly\(\['src','revision','updatedAt'\]\)/);
  assert.doesNotMatch(fragment,/allow (?:delete|write)|accountBindings|featuredMembers|Authentication/);
});
test('Amjad profile accepts a photo, not a rename or deletion',async()=>{
  const value={memberId:'member_9',name:'أمجد',src:'data:image/png;base64,aGVsbG8='};
  assert.deepEqual(validateDirectoryMember(value),value);
  assert.throws(()=>validateDirectoryMember({...value,name:'اسم آخر'}),/NAME_PROTECTED/);
  assert.throws(()=>validateDirectoryMember({...value,src:'data:image/svg+xml,<svg/>'}),/INVALID_DIRECTORY_IMAGE/);
  await assert.rejects(deleteDirectoryMember({enabled:true,adminUid:'fake-admin',fs:{auth:{currentUser:{uid:'fake-admin'}}},session:{state:'member',session:{isAdmin:true}},memberId:'member_9'}),/INVALID_DIRECTORY_MEMBER/);
});
test('photo-only editor locks the admin name but restores ordinary name editing',()=>{
  const source=read('../js/main.js'),elements=new Map();let member={id:'member_9'};
  const qs=selector=>{if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);};
  const scope={getEditingManagedMember:()=>member,qs};vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function refreshMemberManageFormState()'),source.indexOf('function resetMemberManageForm()'))+';this.refresh=refreshMemberManageFormState;',scope);
  scope.refresh();assert.equal(qs('#memberManageName').disabled,true);assert.equal(qs('#memberManageAddBtn').textContent,'حفظ الصورة');
  member={id:'custom_member_test'};scope.refresh();assert.equal(qs('#memberManageName').disabled,false);assert.equal(qs('#memberManageAddBtn').textContent,'حفظ التعديل');
  member=null;scope.refresh();assert.equal(qs('#memberManageName').disabled,false);assert.equal(qs('#memberManageAddBtn').textContent,'إضافة العضو');
  assert.match(source,/if\(member.id!=='member_9'\)actions.push\(\['حذف العضو'/);
});
test('admin card offers photo editing, never deletion, without changing other member controls',()=>{
  const source=read('../js/main.js'),edits=[],removed=[];
  const element=tag=>({tag,children:[],append(...children){this.children.push(...children);},replaceChildren(){this.children=[];}});
  const list=element('section'),submit=element('button');
  const scope={document:{createElement:element},window:{__WA3I_SESSION_CONFIG:{directoryWritesEnabled:true}},
    MEMBER_DIRECTORY_STATE:{ready:true,imagePending:false},qs:selector=>selector==='#memberManageList'?list:submit,
    getAllMembersList:()=>[{id:'member_9',name:'أمجد',src:''},{id:'custom_member_test',name:'عضو',src:''}],
    resolveMemberAvatarSrc:value=>value,beginEditManagedMember:id=>edits.push(id),deleteManagedMember:id=>removed.push(id)};
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function renderMemberManageAdminList()'),source.indexOf('async function persistDirectoryMember('))+';this.render=renderMemberManageAdminList;',scope);
  scope.render();const actions=index=>list.children[index].children.filter(child=>child.tag==='button');
  assert.deepEqual(actions(0).map(button=>button.textContent),['تغيير الصورة']);
  assert.deepEqual(actions(1).map(button=>button.textContent),['تعديل','حذف العضو']);
  actions(0)[0].onclick();assert.deepEqual(edits,['member_9']);assert.deepEqual(removed,[]);
});
