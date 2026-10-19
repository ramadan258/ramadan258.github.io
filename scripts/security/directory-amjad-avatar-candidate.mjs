import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {directoryCrudCandidate} from './directory-crud-candidate.mjs';

export const amjadAvatarCandidateFile=new URL('../../rules/firestore.directory-amjad-avatar-candidate.rules',import.meta.url);
export const amjadAvatarRulesHash='29b3668983f3da41f992e62e414ba5a6b1064289862a163785a2ce073b481ff9';
export function amjadAvatarCandidate({checkFile=true}={}) {
  const base=directoryCrudCandidate(),fragment=readFileSync(new URL('../../rules/directory-amjad-avatar.fragment.rules',import.meta.url),'utf8').replaceAll('\r\n','\n');
  if(base.split('    match /{document=**}').length!==2)throw Error('AMBIGUOUS_RULES_MERGE');
  const candidate=base.replace('    match /{document=**}',()=>fragment+'\n    match /{document=**}');
  if(candidate.replace(fragment+'\n','')!==base)throw Error('AVATAR_SCOPE_CHANGED');
  if(createHash('sha256').update(candidate).digest('hex')!==amjadAvatarRulesHash)throw Error('APPROVED_AVATAR_RULES_CHANGED');
  if(checkFile&&readFileSync(amjadAvatarCandidateFile,'utf8').replaceAll('\r\n','\n')!==candidate)throw Error('AVATAR_CANDIDATE_OUT_OF_DATE');
  return candidate;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--write')writeFileSync(amjadAvatarCandidateFile,amjadAvatarCandidate({checkFile:false}));
  else if(process.argv.length!==2)throw Error('USE_CHECK_OR_WRITE_ONLY');
  console.log(JSON.stringify({candidate:'rules/firestore.directory-amjad-avatar-candidate.rules',sha256:createHash('sha256').update(amjadAvatarCandidate()).digest('hex'),productionChanged:false}));
}
