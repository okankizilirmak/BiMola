import test from 'node:test';
import assert from 'node:assert/strict';
import {isAuthorized,isSameOrigin} from '../src/auth.js';

const header=password=>'Basic '+Buffer.from('admin:'+password).toString('base64');

test('basic authentication compares the configured password',()=>{
 assert.equal(isAuthorized(header('correct-password-1'),'correct-password-1'),true);
 assert.equal(isAuthorized(header('wrong-password-22'),'correct-password-1'),false);
 assert.equal(isAuthorized('Bearer anything','correct-password-1'),false);
});

test('state-changing requests require the browser origin to match host',()=>{
 assert.equal(isSameOrigin('http://updater.example.test:8080','updater.example.test:8080'),true);
 assert.equal(isSameOrigin('https://evil.test','updater.example.test:8080'),false);
 assert.equal(isSameOrigin(undefined,'updater.example.test:8080'),false);
});
