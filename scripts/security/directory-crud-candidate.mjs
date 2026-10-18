import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {directoryCandidate} from './directory-candidate.mjs';

export const directoryCrudCandidateFile=new URL('../../rules/firestore.directory-crud-candidate.rules',import.meta.url);
export function directoryCrudCandidate({checkFile=true}={}) {
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
  const approved=directoryCandidate(),previous=read('../../rules/directory-overlay.fragment.rules'),next=read('../../rules/directory-crud.fragment.rules'),cleanup=read('../../rules/directory-legacy-delete.fragment.rules');
  if(approved.split(previous).length!==2)throw Error('AMBIGUOUS_DIRECTORY_REPLACEMENT');
  const candidate=approved.replace(previous,()=>next).replace('    match /{document=**}',()=>cleanup+'\n    match /{document=**}');
  if(candidate.replace(cleanup+'\n','').replace(next,()=>previous)!==approved)throw Error('DIRECTORY_SCOPE_CHANGED');
  if(checkFile&&readFileSync(directoryCrudCandidateFile,'utf8').replaceAll('\r\n','\n')!==candidate)throw Error('DIRECTORY_CRUD_CANDIDATE_OUT_OF_DATE');
  return candidate;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--write')writeFileSync(directoryCrudCandidateFile,directoryCrudCandidate({checkFile:false}));
  else if(process.argv.length!==2)throw Error('USE_CHECK_OR_WRITE_ONLY');
  console.log(JSON.stringify({candidate:'rules/firestore.directory-crud-candidate.rules',sha256:createHash('sha256').update(directoryCrudCandidate()).digest('hex'),productionChanged:false}));
}
