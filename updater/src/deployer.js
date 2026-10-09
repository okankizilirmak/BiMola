import {candidateConfig,findTarget,replacementConfig} from './docker.js';
import {prepareSource} from './source.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const enc=value=>encodeURIComponent(value);

async function waitHealthy(client,endpointId,id,timeoutMs,state){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  const inspect=await client.docker(endpointId,'GET',`/containers/${enc(id)}/json`);
  const status=inspect.State?.Health?.Status;
  if(status==='healthy'){state.log('Sağlık kontrolü başarılı');return;}
  if(inspect.State?.Status==='exited'||status==='unhealthy')throw new Error(`Container health failed (${status||inspect.State?.Status})`);
  await sleep(2000);
 }
 throw new Error('Container health check timed out');
}

async function discover(client,target){
 const endpoints=await client.json('GET','/api/endpoints');
 const online=(endpoints||[]).filter(e=>e.Status===1);
 const inventory=[];
 for(const endpoint of online){
  try{inventory.push({endpointId:endpoint.Id,containers:await client.docker(endpoint.Id,'GET','/containers/json?all=1')});}catch{/* inaccessible endpoint */}
 }
 return findTarget(inventory,target);
}

async function remove(client,endpointId,id,force=false){await client.docker(endpointId,'DELETE',`/containers/${enc(id)}?v=0&force=${force?1:0}`);}

export async function deploy({client,config,state,sourceFactory=prepareSource}){
 let source,candidateId,newId,backupName,oldRenamed=false,oldStopped=false,target;
 try{
  state.setStage('Kaynak indiriliyor');
  source=await sourceFactory(config);
  const short=source.commit.slice(0,12),image=`bimola:${short}`;
  state.log(`Commit ${short}`);
  state.setStage('Hedef konteyner bulunuyor');
  target=await discover(client,config.targetContainer);
  const inspect=await client.docker(target.endpointId,'GET',`/containers/${enc(target.containerId)}/json`);
  state.setStage('Testler ve imaj derleniyor');
  const buildPath=`/api/endpoints/${enc(target.endpointId)}/docker/build?t=${enc(image)}&dockerfile=Dockerfile.updater&pull=1&rm=1`;
  const build=await client.request('POST',buildPath,{body:source.archive,headers:{'Content-Type':'application/x-tar','Content-Encoding':'gzip','Content-Length':source.archive.length},timeout:config.buildTimeoutMs,maxBytes:32*1024*1024});
  const lines=build.text.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return{};}});
  const failure=lines.find(line=>line.error||line.errorDetail?.message);
  if(failure){
   const output=lines.flatMap(line=>typeof line.stream==='string'?line.stream.split(/\r?\n/):[]).map(line=>line.trim()).filter(Boolean);
   for(const line of output.slice(-30))state.log('Docker: '+line);
   throw new Error('Docker build failed: '+(failure.error||failure.errorDetail.message));
  }
  state.setStage('Aday konteyner doğrulanıyor');
  const candidateName=`${config.targetContainer}-candidate-${short}`;
  const candidate=await client.docker(target.endpointId,'POST',`/containers/create?name=${enc(candidateName)}`,{body:candidateConfig(inspect,image)});candidateId=candidate.Id;
  await client.docker(target.endpointId,'POST',`/containers/${enc(candidateId)}/start`);
  await waitHealthy(client,target.endpointId,candidateId,config.healthTimeoutMs,state);
  await client.docker(target.endpointId,'POST',`/containers/${enc(candidateId)}/stop?t=10`);await remove(client,target.endpointId,candidateId);candidateId=null;
  state.setStage('BiMola güncelleniyor');
  backupName=`${config.targetContainer}-rollback-${Date.now()}`;
  await client.docker(target.endpointId,'POST',`/containers/${enc(target.containerId)}/stop?t=20`);oldStopped=true;
  await client.docker(target.endpointId,'POST',`/containers/${enc(target.containerId)}/rename?name=${enc(backupName)}`);oldRenamed=true;
  const replacement=replacementConfig(inspect,image);replacement.body.NetworkingConfig=replacement.networking;
  const created=await client.docker(target.endpointId,'POST',`/containers/create?name=${enc(config.targetContainer)}`,{body:replacement.body});newId=created.Id;
  await client.docker(target.endpointId,'POST',`/containers/${enc(newId)}/start`);
  await waitHealthy(client,target.endpointId,newId,config.healthTimeoutMs,state);
  try{await remove(client,target.endpointId,target.containerId);oldRenamed=false;}catch{state.log(`Eski yedek ${backupName} silinemedi; yeni sürüm sağlıklı çalışıyor`);oldRenamed=false;}
  state.finish({commit:source.commit,image,endpointId:target.endpointId});
 }catch(error){
  if(target&&candidateId)try{await remove(client,target.endpointId,candidateId,true);}catch{}
  if(target&&oldRenamed){
   state.log('Yeni sürüm başarısız; eski konteynere dönülüyor');
   if(newId)try{await remove(client,target.endpointId,newId,true);}catch{}
   try{await client.docker(target.endpointId,'POST',`/containers/${enc(target.containerId)}/rename?name=${enc(config.targetContainer)}`);await client.docker(target.endpointId,'POST',`/containers/${enc(target.containerId)}/start`);state.log('Eski konteyner yeniden başlatıldı');}catch(rollbackError){error=new Error(`${error.message}; rollback failed: ${rollbackError.message}`);}
  }else if(target&&oldStopped)try{await client.docker(target.endpointId,'POST',`/containers/${enc(target.containerId)}/start`);}catch{}
  state.fail(error);throw error;
 }finally{await source?.cleanup?.();}
}
