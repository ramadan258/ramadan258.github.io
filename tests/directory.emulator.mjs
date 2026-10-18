import test from 'node:test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {fixtures,projectId} from './emulator-fixtures.mjs';
import {directoryCrudCandidate} from '../scripts/security/directory-crud-candidate.mjs';
import {checkDirectoryAdmin} from './directory-admin.emulator.mjs';

test('directory candidate preserves existing permissions and limits public records to profiles',async()=>{
  const fixture=await fixtures(),{members,fs}=fixture,admin=members[2];let candidate;
  try{
    candidate=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:5377,
      rules:directoryCrudCandidate().replaceAll('OpXzKToeVbd9xp1KHuqnD95yXlm2',admin.uid)}});
    await checkDirectoryAdmin({fs,db:admin.db,auth:admin.auth,adminUid:admin.uid,otherDb:members[0].db,
      guestDb:candidate.unauthenticatedContext().firestore(),environment:candidate});
  }finally{await candidate?.cleanup();await fixture.close();}
});
