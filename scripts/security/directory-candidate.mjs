import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const directoryCandidateFile=new URL('../../rules/firestore.directory-candidate.rules',import.meta.url);
export const originalRulesHash='f41fd8338988c42fdfdba341da6b26ee487d710776a68ab136e233f403ab6a5c';
export const directoryRulesHash='e7c9be6da4c031d42d34b4de005b9935d52850e2cf30b098c480f10b386968a8';
export function directoryCandidate({checkFile=true}={}) {
  const base=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8').replaceAll('\r\n','\n');
  const hash=value=>createHash('sha256').update(value).digest('hex'),baseHash=hash(base);
  const crudHash='8ab0677b3caf3019c11a3f275281a51a8a8cd4ee5ef34a5ac5709fcb8b0537f6';
  if(![originalRulesHash,directoryRulesHash,crudHash].includes(baseHash))throw Error('APPROVED_RULES_CHANGED');
  const fragment=readFileSync(new URL('../../rules/directory-overlay.fragment.rules',import.meta.url),'utf8').replaceAll('\r\n','\n');
  if(base.split('    match /{document=**}').length!==2)throw Error('AMBIGUOUS_RULES_MERGE');
  // Keep the previously approved snapshot for an exact, reversible comparison after promotion.
  const candidate=baseHash===crudHash?readFileSync(directoryCandidateFile,'utf8').replaceAll('\r\n','\n'):
    baseHash===directoryRulesHash?base:base.replace('    match /{document=**}',()=>fragment+'\n    match /{document=**}');
  if(hash(candidate)!==directoryRulesHash||hash(candidate.replace(fragment+'\n',''))!==originalRulesHash)throw Error('DIRECTORY_SCOPE_CHANGED');
  if(checkFile&&readFileSync(directoryCandidateFile,'utf8').replaceAll('\r\n','\n')!==candidate)throw Error('DIRECTORY_CANDIDATE_OUT_OF_DATE');
  return candidate;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--write')writeFileSync(directoryCandidateFile,directoryCandidate({checkFile:false}));
  else if(process.argv.length!==2)throw Error('USE_CHECK_OR_WRITE_ONLY');
  const source=directoryCandidate();console.log(JSON.stringify({candidate:'rules/firestore.directory-candidate.rules',sha256:createHash('sha256').update(source).digest('hex'),productionChanged:false}));
}
