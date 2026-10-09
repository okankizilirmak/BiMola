import test from 'node:test';
import assert from 'node:assert/strict';
import {deploy} from '../src/deployer.js';
import {DeploymentState} from '../src/state.js';

test('failed Docker builds retain the failing test output in the deployment log',async()=>{
 const state=new DeploymentState();state.begin();
 const client={
  async json(){return[{Id:1,Status:1}];},
  async docker(_endpoint,_method,path){
   if(path==='/containers/json?all=1')return[{Id:'old',Names:['/bimola']}];
   if(path==='/containers/old/json')return{Config:{},HostConfig:{},NetworkSettings:{Networks:{}}};
   throw new Error(`Unexpected Docker call: ${path}`);
  },
  async request(){return{text:[
   JSON.stringify({stream:'RUN npm test\n'}),
   JSON.stringify({stream:'✖ score storage survives restart (12ms)\n'}),
   JSON.stringify({stream:'  Error: EACCES: permission denied, open /app/data/scores.json\n'}),
   JSON.stringify({errorDetail:{message:'The command returned a non-zero code: 1'}})
  ].join('\n')};}
 };
 await assert.rejects(deploy({client,state,config:{targetContainer:'bimola',healthTimeoutMs:1000,buildTimeoutMs:1000},sourceFactory:async()=>({commit:'a'.repeat(40),archive:Buffer.from('tar'),cleanup:async()=>{}})}),/non-zero code/);
 const messages=state.snapshot().logs.map(entry=>entry.message);
 assert.ok(messages.some(message=>message.includes('score storage survives restart')));
 assert.ok(messages.some(message=>message.includes('EACCES: permission denied')));
});
