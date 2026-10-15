import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {braceletTier,deriveBracelet,createBraceletTracker,braceletStart} from '../bracelet-model.mjs';
import {applyCommand,emptyCatalog,emptyDay,dateKey} from '../model.mjs';

const first='2026-10-16';
const catalog=applyCommand(emptyCatalog(),{},{type:'habit',id:'h1',name:'وهمية',days:[0,1,2,3,4,5,6]},first).catalog;
const record=emptyDay(first);record.habitStatus.h1='done';

test('bracelet boundaries use actual fractions and the first eligible day is Oct 17',()=>{
 assert.equal(braceletStart,'2026-10-17');
 for(const [completed,tier] of [[49,'red'],[50,'blue'],[70,'blue'],[71,'green'],[90,'green'],[91,'gold'],[100,'gold']])assert.equal(braceletTier(completed,100),tier);
 assert.equal(braceletTier(90001,100000),'gold');assert.equal(braceletTier(0,0),'neutral');
 assert.equal(deriveBracelet({catalog,days:{[first]:record},today:first}).tier,'neutral');
 assert.equal(deriveBracelet({catalog,days:{[first]:record},today:'2026-10-17'}).tier,'gold');
 assert.equal(deriveBracelet({catalog:{...catalog,habits:[]},days:{},today:'2026-10-17'}).tier,'neutral');
 const unanswered=emptyDay(first),negative=emptyDay(first);negative.habitStatus.h1='no';
 for(const day of [unanswered,negative])assert.equal(deriveBracelet({catalog,days:{[first]:day},today:'2026-10-17'}).tier,'red');
 assert.deepEqual(unanswered.habitStatus,{});assert.equal(negative.habitStatus.h1,'no');
});

test('local midnight determines yesterday consistently for report, harvest and bracelet',()=>{
 const instant=new Date('2026-10-16T16:00:00Z');
 const tokyo=dateKey(instant,'Asia/Tokyo'),losAngeles=dateKey(instant,'America/Los_Angeles');
 assert.equal(tokyo,'2026-10-17');assert.equal(losAngeles,first);
 assert.equal(deriveBracelet({catalog,days:{[first]:record},today:tokyo}).end,first);
 assert.equal(deriveBracelet({catalog,days:{[first]:record},today:losAngeles}).required,0);
});

test('unconfirmed saves stay neutral, confirmed updates and midnight changes recalculate without new polling reads',async()=>{
 let today=first,version=1,pending=0,readError=null,reads=0,notify,answer=record;
 const store={status:()=>({dataVersion:version,pending,readError}),hasRange:()=>true,ensureRange:async()=>{reads++;},
   snapshot:()=>({catalog,days:{[first]:answer}}),subscribe:fn=>{notify=fn;return()=>{};}};
 const tracker=createBraceletTracker({store,clock:()=>today});
 await tracker.refresh();assert.equal(tracker.current().phase,'before-start');assert.equal(reads,0);
 today='2026-10-17';pending=1;await tracker.refresh();assert.equal(tracker.current().tier,'neutral');assert.equal(tracker.current().phase,'unconfirmed');
 pending=0;await tracker.refresh();assert.equal(tracker.current().tier,'gold');
 answer=emptyDay(first);version++;pending=1;notify();await tracker.refresh();assert.equal(tracker.current().tier,'neutral');
 pending=0;await tracker.refresh();assert.equal(tracker.current().tier,'red');
 readError='READ_FAILED';await tracker.refresh();assert.equal(tracker.current().tier,'neutral');
 readError=null;today='2026-10-18';await tracker.refresh();assert.equal(tracker.current().end,'2026-10-17');assert.equal(reads,0);tracker.close();
});

test('public colors remain deferred and legacy manual records cannot bypass publication security',()=>{
 const config=readFileSync(new URL('../session-config.js',import.meta.url),'utf8');
 assert.match(config,/"publicBracelets":false/);assert.match(config,/"publicBraceletsDeferred":true/);
 const ui=readFileSync(new URL('../bracelet-ui.js',import.meta.url),'utf8');
 assert.ok(ui.indexOf('if(own&&')<ui.indexOf('if(publicDeferred)'));
 assert.doesNotMatch(ui,/setDoc|updateDoc|addDoc/);
});
