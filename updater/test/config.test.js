import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.js';

const base={PORTAINER_API_KEY:'ptr_key',UPDATER_PASSWORD:'long-secret-password',PORTAINER_URL:'https://portainer.example.test:9443'};

test('configuration uses fixed safe defaults',()=>{
 const config=loadConfig(base);
 assert.equal(config.portainerUrl,'https://portainer.example.test:9443');
 assert.equal(config.repository,'vyslbysl/BiMola');
 assert.equal(config.branch,'main');
 assert.equal(config.targetContainer,'bimola');
 assert.equal(config.listenPort,8080);
 assert.equal(config.rejectUnauthorized,false);
});

test('configuration rejects missing secrets and unsafe identifiers',()=>{
 assert.throws(()=>loadConfig({}),/PORTAINER_API_KEY/);
 assert.throws(()=>loadConfig({...base,PORTAINER_URL:undefined}),/PORTAINER_URL/);
 assert.throws(()=>loadConfig({...base,PORTAINER_API_KEY:'key\r\nInjected: yes'}),/PORTAINER_API_KEY/);
 assert.throws(()=>loadConfig({...base,UPDATER_PASSWORD:'short'}),/at least 16/);
 assert.throws(()=>loadConfig({...base,TARGET_CONTAINER:'../bad'}),/TARGET_CONTAINER/);
 assert.throws(()=>loadConfig({...base,GITHUB_REPOSITORY:'https://evil.test/x'}),/GITHUB_REPOSITORY/);
});
