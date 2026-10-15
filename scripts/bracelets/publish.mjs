import {pathToFileURL} from 'node:url';
import {firestoreTransport,readCommittedMembers} from './firestore-reader.mjs';
import {derivePublicFrame} from './derive.mjs';
import {parsePublicBracelets} from '../../public-bracelet.mjs';

const repository='ramadan258/ramadan258.github.io',branch='bracelet-data';
export function assertPublisherEnvironment(env) {
  if(env.GITHUB_ACTIONS!=='true'||env.PUBLIC_BRACELETS_ENABLED!=='true'||env.GITHUB_REPOSITORY!==repository
    ||env.GITHUB_REPOSITORY_ID!=='1210383914'||env.GITHUB_REPOSITORY_OWNER_ID!=='179522853'
    ||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_WORKFLOW_REF!==repository+'/.github/workflows/public-bracelets.yml@refs/heads/main'
    ||!['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))throw Error('PUBLISHER_NOT_APPROVED');
}
export async function publishFrame(frame,api,now=Date.now) {
  const payload=JSON.stringify(parsePublicBracelets(frame))+'\n';
  if(frame.validUntil<=now()||frame.generatedAt>now()+30000)throw Error('FRAME_EXPIRED_BEFORE_PUBLICATION');
  const ref=await api('/git/ref/heads/'+branch,'GET',undefined,true);
  let parent;
  if(ref){
    if(ref.ref!=='refs/heads/'+branch||ref.object?.type!=='commit')throw Error('UNEXPECTED_DATA_BRANCH');
    parent=ref.object.sha;
    const commit=await api('/git/commits/'+parent),tree=await api('/git/trees/'+commit.tree.sha);
    if(tree.truncated||tree.tree.length!==1||tree.tree[0].path!=='current.json'||tree.tree[0].type!=='blob')throw Error('DATA_BRANCH_REVIEW_REQUIRED');
  }
  const blob=await api('/git/blobs','POST',{content:payload,encoding:'utf-8'});
  const tree=await api('/git/trees','POST',{tree:[{path:'current.json',mode:'100644',type:'blob',sha:blob.sha}]});
  const commit=await api('/git/commits','POST',{message:'Update public bracelet colors',tree:tree.sha,parents:parent?[parent]:[]});
  // No force update: a concurrent change cannot be silently overwritten.
  if(parent)await api('/git/refs/heads/'+branch,'PATCH',{sha:commit.sha,force:false});
  else await api('/git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
}
function githubApi(token) {
  if(!token)throw Error('MISSING_GITHUB_TOKEN');
  return async(path,method='GET',body,allowMissing=false)=>{
    if(!path.startsWith('/git/'))throw Error('GITHUB_PATH_NOT_ALLOWED');
    const response=await fetch('https://api.github.com/repos/'+repository+path,{
      method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error',
    });
    if(allowMissing&&response.status===404)return null;
    if(!response.ok)throw Error('GITHUB_HTTP_'+response.status);
    return response.json();
  };
}
async function main() {
  assertPublisherEnvironment(process.env);
  const snapshot=await readCommittedMembers(firestoreTransport(process.env.BRACELETS_READ_TOKEN));
  await publishFrame(derivePublicFrame(snapshot.members,snapshot.snapshotTime),githubApi(process.env.GITHUB_TOKEN));
  console.log('PUBLIC_BRACELETS_PUBLISHED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    // Never print request bodies, access tokens, private records or raw cloud errors.
    const code=/^[A-Z][A-Z_0-9]+$/.test(error.message)?error.message:'PUBLIC_BRACELETS_FAILED';
    console.error(code);process.exitCode=1;
  });
}
