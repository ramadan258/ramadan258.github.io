import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function directoryCandidate() {
  const base=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8').replaceAll('\r\n','\n');
  if(createHash('sha256').update(base).digest('hex')!=='f41fd8338988c42fdfdba341da6b26ee487d710776a68ab136e233f403ab6a5c')throw Error('APPROVED_RULES_CHANGED');
  const fragment=readFileSync(new URL('../../rules/directory-overlay.fragment.rules',import.meta.url),'utf8');
  return base.replace('    match /{document=**}',()=>fragment+'\n    match /{document=**}');
}
