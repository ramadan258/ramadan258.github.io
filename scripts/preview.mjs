import {createServer,request as httpRequest} from 'node:http';
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {trackingStart} from '../tracking-period.mjs';
const root=resolve('.'),port=5390,slow=process.argv.includes('--slow'),compare=process.argv.includes('--compare');
let fixture;
if(process.argv.includes('--emulator'))fixture=await (await import('../tests/emulator-fixtures.mjs')).fixtures();
const admin=fixture?.members[2]||{uid:'fictional-admin',id:'member_9',name:'أمجد تجريبي',src:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'};
const config=`window.__WA3I_FIREBASE_CONFIG=${JSON.stringify({projectId:'demo-wa3i-performance',apiKey:'emulator-only',authDomain:'demo-wa3i-performance.firebaseapp.com',appId:'emulator-only'})};window.__WA3I_SESSION_CONFIG=${JSON.stringify({adminUid:admin.uid,adminMemberId:'member_9',staticMembers:[admin],dynamicMembers:true,publicBracelets:false,publicBraceletsDeferred:true,officialLaunchDate:trackingStart,reviewToday:trackingStart,emulators:{auth:5392,firestore:5392}})};`;
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const baseline=new Map(),runtime=readFileSync('session-runtime.js','utf8');
const observed=`<script>document.addEventListener('DOMContentLoaded',()=>{const body=document.body;if(!(body instanceof Node)||!body.isConnected)return;const observer=new MutationObserver(()=>{const root=document.getElementById('appRoot'),dialog=document.querySelector('dialog[open]');if(root&&!root.classList.contains('is-hidden')&&getComputedStyle(root).visibility!=='hidden'||dialog&&getComputedStyle(dialog).visibility!=='hidden'){window.WA3I_PERFORMANCE?.mark('visible-ui');observer.disconnect();}});observer.observe(body,{subtree:true,attributes:true,childList:true});});</script>`;
function load(path,old){
  if(!old||path.startsWith('/vendor/')&&existsSync(resolve(root,'.'+path))||path==='/performance.js')return readFileSync(resolve(root,'.'+path));
  if(!baseline.has(path))baseline.set(path,execFileSync('git',['show','origin/main:'+path.slice(1)],{maxBuffer:20*1024*1024}));return baseline.get(path);
}
function handler(old,listenPort){return async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${listenPort}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${listenPort}`){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,`http://127.0.0.1:${listenPort}`),path=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
  if(path==='/review-credentials'&&fixture){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(fixture.members.map(({name,id,email,password})=>({name,id,email,password}))));return;}
  const responsive=/^\/responsive-(320|390)\.html$/.exec(path);
  if(responsive){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Local ${responsive[1]}px review</title><style>body{margin:0;background:#071019}iframe{display:block;width:${responsive[1]}px;height:844px;border:0;margin:auto}</style><iframe title="معاينة الهاتف" src="/khutay.html?tab=harvest&performance=1"></iframe>`);return;}
  if(req.method!=='GET'||path.includes('..')||path.includes('\\')||/\/(?:\.git|node_modules|tests|scripts|docs)(?:\/|$)/.test(path)){res.writeHead(404);res.end();return;}
  if(path==='/session-config.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(config);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+'\\')||!old&&(!existsSync(file)||!statSync(file).isFile())){res.writeHead(404);res.end();return;}
  let data;try{data=load(path,old);}catch{res.writeHead(404);res.end();return;}
  if(old&&path==='/session-runtime.js'){
    let source=data.toString().replace(/vendor\/firebase-auth-[A-Z0-9]+\.js/g,runtime.match(/vendor\/firebase-auth-[A-Z0-9]+\.js/)[0]).replace(/vendor\/firebase-data-[A-Z0-9]+\.js/g,runtime.match(/vendor\/firebase-data-[A-Z0-9]+\.js/)[0]);
    source=source.replace('authHandle=auth;authModule=authMod;','authMod.connectAuthEmulator(auth,"http://127.0.0.1:5392",{disableWarnings:true});fs.connectFirestoreEmulator(db,"127.0.0.1",5392);authHandle=auth;authModule=authMod;');
    source=source.replace('const login=(member,password,email)=>serialize(async()=>{','const login=(member,password,email)=>serialize(async()=>{window.WA3I_PERFORMANCE?.start("password-login");');
    source=source.replace("finally{password='';document.body.classList.remove('session-pending');}","finally{password='';document.body.classList.remove('session-pending');window.WA3I_PERFORMANCE?.end('password-login');}");
    data=Buffer.from(source);
  }
  if(path.endsWith('.html')){let source=data.toString();if(!source.includes('src="performance.js'))source=source.replace('<head>','<head><script src="performance.js"></script>');
    if(old)source=source.replace(/session-runtime\.js\?v=[a-z0-9]+/g,'session-runtime.js?v=baseline-emulator-r2');
    data=Buffer.from(source.replace('</head>',observed+'</head>'));}
  if(slow)await new Promise(resolve=>setTimeout(resolve,180));
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'public,max-age=3600'});res.end(data);
};}
const servers=[createServer(handler(false,port))];servers[0].listen(port,'127.0.0.1',()=>console.log(`Local emulator-only preview: http://127.0.0.1:${port}/?performance=1`));
if(compare){const old=createServer(handler(true,5391));old.listen(5391,'127.0.0.1');servers.push(old);}
const proxy=createServer((req,res)=>{
  if(req.headers.host!=='127.0.0.1:5392'){res.writeHead(403);res.end();return;}
  const target=/identitytoolkit|securetoken/.test(req.url)?5376:5377;
  const upstream=httpRequest({host:'127.0.0.1',port:target,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${target}`}},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
  if(slow)setTimeout(()=>req.pipe(upstream),180);else req.pipe(upstream);
});proxy.listen(5392,'127.0.0.1');servers.push(proxy);
process.once('SIGINT',()=>{servers.forEach(server=>server.close());void fixture?.close();});
