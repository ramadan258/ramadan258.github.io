import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const directoryCandidateFile=new URL('../../rules/firestore.directory-candidate.rules',import.meta.url);
export function directoryCandidate({checkFile=true}={}) {
  const base=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8').replaceAll('\r\n','\n');
  if(createHash('sha256').update(base).digest('hex')!=='f41fd8338988c42fdfdba341da6b26ee487d710776a68ab136e233f403ab6a5c')throw Error('APPROVED_RULES_CHANGED');
  const fragment=readFileSync(new URL('../../rules/directory-overlay.fragment.rules',import.meta.url),'utf8').replaceAll('\r\n','\n');
  if(base.includes('match /directoryMembers/')||base.split('    match /{document=**}').length!==2)throw Error('AMBIGUOUS_RULES_MERGE');
  const candidate=base.replace('    match /{document=**}',()=>fragment+'\n    match /{document=**}');
  if(checkFile&&readFileSync(directoryCandidateFile,'utf8').replaceAll('\r\n','\n')!==candidate)throw Error('DIRECTORY_CANDIDATE_OUT_OF_DATE');
  return candidate;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--write')writeFileSync(directoryCandidateFile,directoryCandidate({checkFile:false}));
  else if(process.argv.length!==2)throw Error('USE_CHECK_OR_WRITE_ONLY');
  const source=directoryCandidate();console.log(JSON.stringify({candidate:'rules/firestore.directory-candidate.rules',sha256:createHash('sha256').update(source).digest('hex'),productionChanged:false}));
}
