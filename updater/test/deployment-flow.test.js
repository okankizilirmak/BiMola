import test from 'node:test';
import assert from 'node:assert/strict';
import {deploy} from '../src/deployer.js';
import {DeploymentState} from '../src/state.js';

test('a healthy replacement remains successful when obsolete backup cleanup fails',async()=>{
 const calls=[];let creates=0;
 const inspect={Config:{Env:['PORT=3000'],Healthcheck:{Test:['CMD','health']}},HostConfig:{PortBindings:{'3000/tcp':[{HostPort:'3000'}]},RestartPolicy:{Name:'unless-stopped'},NetworkMode:'bridge'},NetworkSettings:{Networks:{bridge:{Aliases:['bimola']}}}};
 const client={
  async json(method,path){calls.push([method,path]);if(path==='/api/endpoints')return[{Id:1,Status:1}];throw new Error('unexpected '+path);},
  async request(method,path){calls.push([method,path]);return{text:'{"stream":"done"}\n'};},
  async docker(endpoint,method,path){
   calls.push([method,path]);
   if(path==='/containers/json?all=1')return[{Id:'old',Names:['/bimola']}];
   if(path==='/containers/old/json')return inspect;
   if(path.includes('/json'))return{State:{Status:'running',Health:{Status:'healthy'}}};
   if(path.startsWith('/containers/create'))return{Id:++creates===1?'candidate':'new'};
   if(method==='DELETE'&&path.startsWith('/containers/old?'))throw new Error('backup cleanup denied');
   return null;
  }
 };
 const state=new DeploymentState();state.begin();
 await deploy({client,config:{targetContainer:'bimola',repository:'vyslbysl/BiMola',branch:'main',healthTimeoutMs:1000,buildTimeoutMs:1000},state,sourceFactory:async()=>({commit:'abcdef1234567890',archive:Buffer.from('tar'),cleanup:async()=>{}})});
 assert.equal(state.snapshot().stage,'complete');
 assert.ok(state.snapshot().logs.some(x=>x.message.includes('yedek')));
 assert.ok(!calls.some(([,path])=>path.startsWith('/containers/new?')));
});
