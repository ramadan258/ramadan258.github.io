import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function renderer(){
  let created=0,srcWrites=0;let members=[];
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes=new Map();this.textContent='';this.parent=null;}
    get firstElementChild(){return this.children[0]||null;}
    get nextElementSibling(){return this.parent?.children[this.parent.children.indexOf(this)+1]||null;}
    getAttribute(key){return this.attributes.get(key)??null;}
    set src(value){srcWrites++;this.attributes.set('src',value);}
    set alt(value){this.attributes.set('alt',value);}
    append(...children){for(const child of children)this.insertBefore(child,null);}
    insertBefore(child,before){if(child===before)return;child.remove();const at=before?this.children.indexOf(before):this.children.length;assert.ok(at>=0);this.children.splice(at,0,child);child.parent=this;}
    remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
    querySelector(tag){return this.children.find(child=>child.tag===tag)||null;}
  }
  const slider=new Element('section'),scope={qs:()=>slider,getAllMembersList:()=>members,resolveMemberAvatarSrc:src=>src||'default',
    document:{createElement:tag=>{created++;return new Element(tag);}},Map};
  vm.createContext(scope);const source=read('../js/main.js');
  vm.runInContext(source.slice(source.indexOf('function renderMembersSection()'),source.indexOf('function shouldRenderMembersSectionUI()'))+';this.render=renderMembersSection;',scope);
  return {slider,set(value){members=value;scope.render();},get created(){return created;},get srcWrites(){return srcWrites;}};
}
const member=(id,name=id,src='images/test.png')=>({id,name,src,source:'directory'});
test('directory metadata and duplicate refreshes do not recreate or reload unchanged avatars',()=>{
  const r=renderer();r.set([member('member_9'),member('custom_member_test')]);
  const cards=[...r.slider.children],images=cards.map(c=>c.querySelector('img'));
  for(let index=0;index<10;index++)r.set([member('member_9'),member('custom_member_test')]);
  assert.equal(r.created,6);assert.equal(r.srcWrites,2);assert.deepEqual(r.slider.children,cards);
  assert.deepEqual(r.slider.children.map(c=>c.querySelector('img')),images);
});
test('name/photo edits update the same card, without resetting other images',()=>{
  const r=renderer();r.set([member('member_9'),member('custom_member_test')]);const card=r.slider.children[1],image=card.querySelector('img');
  r.set([member('member_9'),member('custom_member_test','اسم جديد','data:image/png;base64,dGVzdA==')]);
  assert.equal(r.slider.children[1],card);assert.equal(card.querySelector('img'),image);assert.equal(card.querySelector('h3').textContent,'اسم جديد');
  assert.equal(r.created,6);assert.equal(r.srcWrites,3);
});
test('authoritative removal and ordering are reflected without stale cards or CSS order',()=>{
  const r=renderer();r.set([member('a'),member('b'),member('c')]);const c=r.slider.children[2];
  r.set([member('c'),member('a')]);assert.deepEqual(r.slider.children.map(card=>card.dataset.memberId),['c','a']);
  assert.equal(r.slider.children[0],c);assert.deepEqual(r.slider.children.map(card=>card.dataset.origIndex),['0','1']);
  r.set([]);assert.equal(r.slider.children.length,0);
});
test('visible-first avatars are eager and only the first receives high fetch priority',()=>{
  const r=renderer();r.set(['a','b','c','d','e'].map(id=>member(id)));const images=r.slider.children.map(c=>c.querySelector('img'));
  assert.deepEqual(images.map(img=>img.loading),['eager','eager','eager','lazy','lazy']);
  assert.deepEqual(images.map(img=>img.fetchPriority),['high','auto','auto','auto','auto']);
  assert.ok(images.every(img=>img.decoding==='async'));
});
test('only public directory dependencies preload and the authoritative server filter stays intact',()=>{
  const html=read('../index.html'),source=read('../js/main.js');
  const preloads=Array.from(html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g),m=>m[1]);
  assert.ok(preloads.every(p=>!p.includes('?')),'preloads must match dynamic import URLs without duplicate query variants');
  assert.equal(preloads.filter(p=>/^vendor\/firebase-data-/.test(p)).length,1);
  assert.ok(preloads.includes('directory-service.mjs'));
  assert.ok(preloads.every(p=>existsSync(new URL('../'+p,import.meta.url))));
  assert.ok(preloads.every(p=>!p.includes('firebase-auth')));
  assert.match(source,/if\(snapshot.metadata.fromCache\|\|snapshot.metadata.hasPendingWrites\)return/);
});
