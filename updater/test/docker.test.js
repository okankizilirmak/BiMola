import test from 'node:test';
import assert from 'node:assert/strict';
import {replacementConfig,candidateConfig,findTarget} from '../src/docker.js';

test('target discovery requires one exact container name',()=>{
 const found=findTarget([{endpointId:1,containers:[{Id:'a',Names:['/bimola']}]},{endpointId:2,containers:[{Id:'b',Names:['/other']}]}],'bimola');
 assert.deepEqual(found,{endpointId:1,containerId:'a'});
 assert.throws(()=>findTarget([{endpointId:1,containers:[{Id:'a',Names:['/bimola']}]},{endpointId:2,containers:[{Id:'b',Names:['/bimola']}]}],'bimola'),/multiple/);
});

test('replacement preserves runtime settings without copying container identity',()=>{
 const inspect={
  Config:{Env:['PORT=3000'],Cmd:['node','server.js'],Entrypoint:null,WorkingDir:'/app',User:'node',Labels:{team:'game'},ExposedPorts:{'3000/tcp':{}},Healthcheck:{Test:['CMD','health']}},
  HostConfig:{Binds:['data:/data'],PortBindings:{'3000/tcp':[{HostPort:'3000'}]},RestartPolicy:{Name:'unless-stopped'},NetworkMode:'bridge',ReadonlyRootfs:false,Privileged:false,AutoRemove:false,CapAdd:null,CapDrop:null},
  NetworkSettings:{Networks:{bridge:{Aliases:['bimola']}}}
 };
 const result=replacementConfig(inspect,'bimola:abc123');
 assert.equal(result.body.Image,'bimola:abc123');
 assert.deepEqual(result.body.Env,['PORT=3000']);
 assert.deepEqual(result.body.HostConfig.PortBindings,inspect.HostConfig.PortBindings);
 assert.equal('CapAdd' in result.body.HostConfig,false);
 assert.equal('CapDrop' in result.body.HostConfig,false);
 assert.equal(result.body.Hostname,undefined);
 assert.deepEqual(result.networking.EndpointsConfig.bridge.Aliases,['bimola']);
});

test('replacement reuses an anonymous score volume without sharing it with the candidate',()=>{
 const inspect={
  Config:{Env:['BIMOLA_DATA_DIR=/app/data']},
  HostConfig:{Binds:null,Mounts:null,NetworkMode:'bridge'},
  Mounts:[{Type:'volume',Name:'existing-scores',Destination:'/app/data',RW:true}],
  NetworkSettings:{Networks:{bridge:{}}}
 };
 const replacement=replacementConfig(inspect,'bimola:new');
 assert.deepEqual(replacement.body.HostConfig.Mounts,[{Type:'volume',Source:'existing-scores',Target:'/app/data',ReadOnly:false}]);
 assert.equal(candidateConfig(inspect,'bimola:new').HostConfig.Mounts,undefined);
});
