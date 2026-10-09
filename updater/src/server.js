import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './config.js';
import {isAuthorized,isSameOrigin} from './auth.js';
import {DeploymentState} from './state.js';
import {PortainerClient} from './portainer.js';
import {deploy} from './deployer.js';

const config=loadConfig(),state=new DeploymentState();
const client=new PortainerClient({baseUrl:config.portainerUrl,apiKey:config.portainerApiKey,rejectUnauthorized:config.rejectUnauthorized});
const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const failures=new Map();

function secureHeaders(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
function remote(req){return req.socket.remoteAddress||'unknown';}
function authenticate(req,res){const key=remote(req),entry=failures.get(key);if(entry&&entry.until>Date.now()){json(res,429,{error:'Çok fazla başarısız giriş. Biraz bekle.'});return false;}if(isAuthorized(req.headers.authorization,config.password)){failures.delete(key);return true;}const count=(entry?.count||0)+1;failures.set(key,{count,until:count>=5?Date.now()+60000:0});res.setHeader('WWW-Authenticate','Basic realm="BiMola Updater", charset="UTF-8"');json(res,401,{error:'Kimlik doğrulama gerekli'});return false;}

const server=http.createServer(async(req,res)=>{secureHeaders(res);const url=new URL(req.url,'http://localhost');
 try{
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true});
  if(!authenticate(req,res))return;
  if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{...state.snapshot(),target:config.targetContainer,repository:config.repository,branch:config.branch});
  if(req.method==='POST'&&url.pathname==='/api/deploy'){
   if(!isSameOrigin(req.headers.origin,req.headers.host))return json(res,403,{error:'Geçersiz istek kaynağı'});
   if(!state.begin())return json(res,409,{error:'Bir güncelleme zaten çalışıyor'});
   deploy({client,config,state}).catch(()=>{});return json(res,202,{ok:true});
  }
  if(req.method==='GET'&&assets[url.pathname]){const[file,type]=assets[url.pathname];res.writeHead(200,{'Content-Type':type});return res.end(await readFile(publicDir+file));}
  json(res,404,{error:'Bulunamadı'});
 }catch(error){state.log('HTTP hatası: '+error.message);json(res,500,{error:'Sunucu hatası'});}
});
server.listen(config.listenPort,'0.0.0.0',()=>console.log(`BiMola Updater hazır: :${config.listenPort}`));
