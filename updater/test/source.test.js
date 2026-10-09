import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as sourceModule from '../src/source.js';

test('deployment image includes the modular game server in build and runtime stages',async()=>{
 const checkout=await mkdtemp(join(tmpdir(),'bimola-source-test-'));
 try{
  await sourceModule.writeBuildFiles(checkout);
  const dockerfile=await readFile(join(checkout,'Dockerfile.updater'),'utf8');
  const stages=dockerfile.split('FROM node:24-alpine');
  assert.equal(stages.length,3);
  assert.match(stages[1],/COPY server \.\/server/);
  assert.match(stages[2],/COPY --from=build --chown=node:node \/app\/server \.\/server/);
  assert.doesNotMatch(dockerfile,/game\.js/);
 }finally{await rm(checkout,{recursive:true,force:true});}
});

test('updater build context overrides the game ignore rules so tests are included',async()=>{
 assert.equal(typeof sourceModule.writeBuildFiles,'function');
 const checkout=await mkdtemp(join(tmpdir(),'bimola-source-test-'));
 try{
  await sourceModule.writeBuildFiles(checkout);
  const ignore=await readFile(join(checkout,'Dockerfile.updater.dockerignore'),'utf8');
  assert.doesNotMatch(ignore,/^test\/?$/m);
  assert.match(ignore,/^node_modules$/m);
  assert.match(ignore,/^\.git$/m);
 }finally{await rm(checkout,{recursive:true,force:true});}
});

test('game Docker context test can read the original Dockerfile and ignore rules',async()=>{
 const checkout=await mkdtemp(join(tmpdir(),'bimola-source-test-'));
 try{
  await sourceModule.writeBuildFiles(checkout);
  const dockerfile=await readFile(join(checkout,'Dockerfile.updater'),'utf8');
  const buildStage=dockerfile.split('FROM node:24-alpine')[1];
  assert.match(buildStage,/COPY Dockerfile \.dockerignore \.\//);
 }finally{await rm(checkout,{recursive:true,force:true});}
});

test('runtime image prepares the persistent score directory for the node user',async()=>{
 const checkout=await mkdtemp(join(tmpdir(),'bimola-source-test-'));
 try{
  await sourceModule.writeBuildFiles(checkout);
  const dockerfile=await readFile(join(checkout,'Dockerfile.updater'),'utf8');
  const runtime=dockerfile.split('FROM node:24-alpine')[2];
  assert.match(runtime,/RUN mkdir -p \/app\/data && chown node:node \/app\/data/);
  assert.match(runtime,/ENV BIMOLA_DATA_DIR=\/app\/data/);
  assert.match(runtime,/VOLUME \["\/app\/data"\]/);
 }finally{await rm(checkout,{recursive:true,force:true});}
});
