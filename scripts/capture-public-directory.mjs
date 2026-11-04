import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {readPublicDirectory} from '../public-directory-first-read.mjs';
import {publicDirectorySnapshot} from '../public-directory-cache.mjs';
import {buildPublicDirectory} from './public-directory-build.mjs';
const scope={window:{}};vm.runInNewContext(readFileSync('session-config.js','utf8'),scope);
const config=scope.window.__WA3I_FIREBASE_CONFIG;
if(config.projectId!=='tribe-app-e3e9c'||scope.window.__WA3I_SESSION_CONFIG?.emulators)throw Error('EXPECTED_PUBLIC_PROJECT_ONLY');
// Exactly the existing unauthenticated public name/photo projections. No Admin SDK or credentials.
const result=await readPublicDirectory(config),snapshot=publicDirectorySnapshot(result,config.projectId);
if(!result.directory.has('member_9'))throw Error('ADMIN_PUBLIC_PROFILE_MISSING');
writeFileSync('public-directory-snapshot.json',JSON.stringify(snapshot)+'\n');buildPublicDirectory();
console.log(JSON.stringify({projectId:config.projectId,publicProfiles:new Set([...result.directory.keys(),...result.legacy.keys()]).size,bytes:JSON.stringify(snapshot).length,productionWrites:0,privateRecordsRead:0}));
