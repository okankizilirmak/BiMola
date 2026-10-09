import test from 'node:test';
import assert from 'node:assert/strict';
import {DeploymentState} from '../src/state.js';

test('deployment state prevents concurrent runs and bounds logs',()=>{
 const state=new DeploymentState(3);
 assert.equal(state.begin(),true);
 assert.equal(state.begin(),false);
 for(let i=0;i<5;i++)state.log('line '+i);
 assert.deepEqual(state.snapshot().logs.map(x=>x.message),['line 2','line 3','line 4']);
 state.finish({commit:'abc'});
 assert.equal(state.snapshot().running,false);
 assert.equal(state.snapshot().lastSuccess.commit,'abc');
});
