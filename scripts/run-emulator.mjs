import {spawn} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const cli=resolve(process.env.APPDATA||'','npm/node_modules/firebase-tools/lib/bin/firebase.js');
const env={...process.env,GCLOUD_PROJECT:'demo-wa3i-performance',CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'};
delete env.GOOGLE_APPLICATION_CREDENTIALS;delete env.FIREBASE_TOKEN;
if(!env.JAVA_HOME){
  const runtime=resolve('../auth-security-lab/.runtime');
  if(existsSync(runtime)){const entry=readdirSync(runtime).find(name=>existsSync(resolve(runtime,name,'bin/java.exe')));if(entry)env.JAVA_HOME=resolve(runtime,entry);}
}
if(env.JAVA_HOME){const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path');const path=env[pathKey]||'';
  for(const key of Object.keys(env).filter(key=>key.toLowerCase()==='path'))delete env[key];env.Path=resolve(env.JAVA_HOME,'bin')+';'+dirname(process.execPath)+';'+path;}
if(!existsSync(cli))throw Error('Install Firebase CLI before running emulator tests.');
const preview=process.argv.includes('--preview');
const child=spawn(process.execPath,[cli,'emulators:exec','--project','demo-wa3i-performance','--config','firebase.emulator.json','--only','auth,firestore','--non-interactive',
  preview?'node scripts/preview.mjs --emulator --compare'+(process.argv.includes('--slow')?' --slow':''):
    process.argv.includes('--directory')?'node --test tests/directory.emulator.mjs':'node --test tests/emulator.integration.mjs'],{env,cwd:process.cwd(),stdio:'inherit',windowsHide:true});
child.once('exit',code=>{process.exitCode=code||0;});
process.once('SIGINT',()=>child.kill());process.once('SIGTERM',()=>child.kill());
