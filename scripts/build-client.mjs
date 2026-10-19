import {build} from 'esbuild';
import {readFileSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {trackingStart} from '../tracking-period.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
const editable=['.','js'].flatMap(directory=>readdirSync(directory).filter(name=>/\.(?:html|js|mjs|css|json)$/.test(name)).map(name=>directory+'/'+name)).sort();
const normalize=source=>source.replaceAll('\r\n','\n').replace(/release=[a-zA-Z0-9-]+/g,'release=BUILD')
  .replace(/(?:client|vendor)\/([a-z-]+)-[A-Z0-9]+\.js/g,'$1.js').replace(/\?v=[a-z0-9]+/g,'?v=BUILD');
const release=trackingStart.replaceAll('-','')+'-'+sha(editable.map(path=>path+'\n'+normalize(readFileSync(path,'utf8'))).join('\n'));
for(const path of editable){const source=readFileSync(path,'utf8'),changed=source.replace(/release=[a-zA-Z0-9-]+/g,'release='+release);if(changed!==source)writeFileSync(path,changed);}
const sources=['planner-ui','report-ui','bracelet-ui','private-store','verify-session','server-read-pool','cloud-write-guard'];
const currentOutputs=new Set();
const run=async(entryPoints,outdir)=>{
  const result=await build({entryPoints,outdir,bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',minify:true,entryNames:'[name]-[hash]',chunkNames:'shared-[hash]',metafile:true});
  for(const path of Object.keys(result.metafile.outputs))currentOutputs.add(path.replaceAll('\\','/'));
  return Object.fromEntries(Object.entries(result.metafile.outputs).filter(([,m])=>m.entryPoint).map(([path,m])=>[m.entryPoint.split('/').pop().replace('.js',''),path.replaceAll('\\','/')]));
};
const vendor=await run({'firebase-auth':'scripts/firebase-auth-entry.js','firebase-data':'scripts/firebase-data-entry.js'},'vendor');
const client=await run(Object.fromEntries(sources.map(name=>[name,name+'.js'])),'client');
let runtime=readFileSync('session-runtime.js','utf8');
for(const name of ['firebase-auth','firebase-data'])runtime=runtime.replace(new RegExp('vendor/'+name+'-[A-Z0-9]+\\.js','g'),vendor[name+'-entry']);
for(const name of sources)runtime=runtime.replace(new RegExp('client/'+name+'-[A-Z0-9]+\\.js','g'),client[name]);
writeFileSync('session-runtime.js',runtime);
for(const name of readdirSync('.').filter(name=>name.endsWith('.html'))){
  let html=readFileSync(name,'utf8');
  for(const name of ['firebase-auth','firebase-data'])html=html.replace(new RegExp('vendor/'+name+'-[A-Z0-9]+\\.js','g'),vendor[name+'-entry']);
  for(const name of sources)html=html.replace(new RegExp('client/'+name+'-[A-Z0-9]+\\.js(?:\\?v=[a-z0-9]+)?','g'),client[name]);
  if(html.includes('session-runtime.js')&&!html.includes('src="performance.js'))html=html.replace(/<script src="session-config/, '<script src="performance.js"></script><script src="session-config');
  html=html.replace(/((?:src|href)=")(?!https?:|data:)([^"?#]+)(?:\?v=[a-z0-9]+)?"/g,(all,start,path)=>{
    if(!/\.(js|mjs|css)$/.test(path))return all;
    try{return start+path+'?v='+sha(readFileSync(path,'utf8').replaceAll('\r\n','\n'))+'"';}catch{return all;}
  });
  // Match the dynamic import URL exactly; a different query would download the module twice.
  html=html.replace(/(<link rel="modulepreload" href="[^"?]+)\?v=[a-z0-9]+"/g,'$1"');
  writeFileSync(name,html);
}
// Retain every tracked bundle for cached pages; remove only obsolete local build outputs.
const tracked=new Set(execFileSync('git',['ls-files','--','client','vendor'],{encoding:'utf8'}).trim().split(/\r?\n/));
for(const directory of ['client','vendor'])for(const name of readdirSync(directory)){
  const path=directory+'/'+name;
  if(/^[a-z-]+-[A-Z0-9]+\.js$/.test(name)&&!tracked.has(path)&&!currentOutputs.has(path))unlinkSync(path);
}
console.log(JSON.stringify({release,client,auth:vendor['firebase-auth-entry'],data:vendor['firebase-data-entry']}));
