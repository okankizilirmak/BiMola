import test from 'node:test';
import assert from 'node:assert/strict';
import {replayFrame, REPLAY_MS} from '../public/games/blind-shot/replay.js';

const players=[{id:'a',name:'Ada',x:0,y:0},{id:'b',name:'Bora',x:100,y:0},{id:'c',name:'Cem',x:200,y:0}];
const shots=[
  {id:'b',target:'a',x:100,y:0,endX:0,endY:0},
  {id:'a',target:'b',x:0,y:0,endX:100,endY:0},
  {id:'c',target:null,x:200,y:0,endX:700,endY:0},
];
const state={phase:'reveal',players,shots,me:'a'};

test('each viewer follows their own shot before incoming hits, regardless of server shot order',()=>{
  for(const me of ['a','b','c']){
    const frame=replayFrame({...state,me},800);
    assert.equal(frame.shot.id,me);
    assert.equal(frame.stage,'shot');
    assert.match(frame.caption,/SENİN ATIŞIN/);
    assert.equal(frame.age,.2);
  }
  assert.equal(replayFrame(state,2300).shot.id,'b');
  assert.equal(replayFrame({...state,me:'b'},2300).shot.id,'a');
  assert.match(replayFrame(state,2300).caption,/SENİ VURAN · Bora → Ada/);
});

test('successful shooters see their victim afterwards; impact animation resumes at contact',()=>{
  const frame=replayFrame({...state,shots:[shots[1],shots[2]]},3000);
  assert.equal(frame.shot.target,'b');
  assert.equal(frame.stage,'impact');
  assert.equal(frame.age,.5);
  assert.match(frame.caption,/İSABETİN · Ada → Bora/);
});

test('a miss remains personal when there are no impacts; unrelated impacts use nearest endpoint',()=>{
  const miss=replayFrame({...state,me:'c',shots:[shots[2]]},3000);
  assert.equal(miss.shot.id,'c');
  assert.equal(miss.stage,'shot');
  const impact=replayFrame({...state,me:'c'},3000);
  assert.equal(impact.shot.id,'a');
  assert.match(impact.caption,/İSABET · Ada → Bora/);
});

test('eliminated viewers can watch public shots without pretending they fired',()=>{
  const frame=replayFrame({...state,me:'spectator'},500);
  assert.match(frame.caption,/İZLEYİCİ/);
  assert.ok(shots.includes(frame.shot));
  assert.deepEqual(replayFrame({...state,me:'spectator'},500),frame);
});

test('replay never uses hidden planning packets, stops at deadline and leaves state unchanged',()=>{
  const before=JSON.stringify(state);
  for(const phase of ['plan','lobby'])assert.equal(replayFrame({...state,phase},1000),null);
  assert.equal(replayFrame(state,-1),null);
  assert.equal(replayFrame(state,REPLAY_MS),null);
  assert.equal(replayFrame({...state,shots:[]},1000),null);
  for(const phase of ['reveal','round-end','end'])assert.ok(replayFrame({...state,phase},1000));
  assert.equal(JSON.stringify(state),before);
});
