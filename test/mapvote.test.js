import test from 'node:test';
import assert from 'node:assert/strict';
import {player,start,tick,view,sanitizeSettings,configureRoom,castVote,openVote,closeVote,VOTE_SECONDS,defaultSettings} from '../server/games/prop-hunt/game.js';
import {MAP_CHOICES} from '../public/games/prop-hunt/maps.js';

function room(mapVote=60,names=['a','b','c']){
 const r={code:'1234',host:'a',players:{},phase:'lobby',round:0,
  settings:sanitizeSettings({mapId:'loft',mapVote,teamSize:6,botMode:'fill',swapTeams:false})};
 names.forEach((id,i)=>{r.players[id]=player(id,id,false,i?'hider':'hunter');});
 assert.equal(start(r,1000).ok,true);
 return r;
}
// Turu bitirmek oylamayı açan tek yol: süre dolar, tick faz geçişini yapar.
function finish(r,now){r.phase='play';r.until=now-1;tick(r,now,.05);return r.vote;}

test('a finished round opens a two-map vote that never offers the map just played',()=>{
 for(let i=0;i<40;i++){
  const r=room(),vote=finish(r,5000);
  assert.equal(vote.options.length,2);
  assert.notEqual(vote.options[0],vote.options[1]);
  assert.ok(!vote.options.includes(r.settings.mapId));
  for(const id of vote.options)assert.ok(MAP_CHOICES.some(m=>m.id===id),id);
  assert.equal(vote.closed,false);
  assert.equal(vote.until,5000+r.settings.mapVote*1000);
 }
});
test('the majority wins and the next round is played on it',()=>{
 const r=room(),vote=finish(r,5000),[first,second]=vote.options;
 assert.equal(castVote(r,r.players.b,second,5100).ok,true);
 assert.equal(castVote(r,r.players.c,second,5200).ok,true);
 assert.equal(castVote(r,r.players.a,first,5300).ok,true);
 // Süre dolmadan kapanmaz: sayaç bitene kadar oy değiştirilebilir.
 tick(r,5000+59000,.05);assert.equal(r.vote.closed,false);
 tick(r,5000+60000,.05);
 assert.equal(r.vote.closed,true);
 assert.equal(r.vote.winner,second);
 assert.equal(start(r,70000).ok,true);
 assert.equal(r.settings.mapId,second);
 assert.equal(r.vote,null);
});
test('no votes and a tie both fall back to the first candidate',()=>{
 const quiet=room(),quietVote=finish(quiet,5000);
 tick(quiet,5000+60000,.05);
 assert.equal(quiet.vote.winner,quietVote.options[0]);

 const tied=room(),tiedVote=finish(tied,5000);
 castVote(tied,tied.players.b,tiedVote.options[1],5100);
 castVote(tied,tied.players.c,tiedVote.options[0],5200);
 tick(tied,5000+60000,.05);
 assert.equal(tied.vote.winner,tiedVote.options[0]);
});
test('a player may change their vote and only the last one counts',()=>{
 const r=room(),vote=finish(r,5000),[first,second]=vote.options;
 castVote(r,r.players.b,first,5100);
 castVote(r,r.players.c,first,5200);
 const result=castVote(r,r.players.b,second,5300);
 assert.equal(result.counts[first],1);
 assert.equal(result.counts[second],1);
 assert.equal(Object.keys(r.vote.votes).length,2);
 tick(r,5000+60000,.05);
 assert.equal(r.vote.winner,first);
});
test('starting early closes the vote on whoever leads at that moment',()=>{
 const r=room(),vote=finish(r,5000),[,second]=vote.options;
 castVote(r,r.players.b,second,5100);
 start(r,9000);
 assert.equal(r.settings.mapId,second);
 assert.equal(r.vote,null);
});
test('votes are rejected outside the open window, from bots and for maps not on the ballot',()=>{
 const r=room(),vote=finish(r,5000);
 assert.ok(!castVote(r,r.players.b,r.settings.mapId,5100).ok,'oylanan harita aday değil');
 assert.ok(!castVote(r,r.players.b,'../../etc',5100).ok);
 assert.ok(!castVote(r,{id:'bot-1',bot:true},vote.options[0],5100).ok);
 closeVote(r,5400);
 assert.ok(!castVote(r,r.players.b,vote.options[0],5500).ok,'kapalı oylama');
 const fresh=room();
 assert.ok(!castVote(fresh,fresh.players.b,'market',1100).ok,'tur sürerken oy yok');
});
test('the vote is off when rotation or the setting is off, and the old random pick still runs',()=>{
 const off=room(0);
 assert.equal(finish(off,5000),null);
 const before=off.settings.mapId;
 start(off,9000);
 assert.notEqual(off.settings.mapId,before);

 const pinnedRotation=room();
 pinnedRotation.settings.mapRotate=false;
 assert.equal(finish(pinnedRotation,5000),null);
 assert.equal(VOTE_SECONDS.includes(defaultSettings.mapVote),true);
});
test('the host picking a map, or switching the vote off, cancels an open ballot',()=>{
 const picked=room();finish(picked,5000);
 assert.equal(configureRoom(picked,{mapId:'harbor'},'a').ok,true);
 assert.equal(picked.vote,null);
 start(picked,9000);
 assert.equal(picked.settings.mapId,'harbor','kurucunun seçtiği harita oylamayı yener');

 const disabled=room();finish(disabled,5000);
 configureRoom(disabled,{mapVote:0},'a');
 assert.equal(disabled.vote,null);
});
test('only the host may reconfigure, but every human in the room votes — including next-round joiners',()=>{
 const r=room(),vote=finish(r,5000);
 r.players.d=player('d','Sıradaki',false,'hider');r.players.d.waiting=true;
 assert.equal(castVote(r,r.players.d,vote.options[1],5100).ok,true,'bekleyen oy verebilir');
 // Bekleyenin paketi ayrı bir daldan çıkar; oylama oraya da gitmeli, yoksa oy veremez.
 const waitingPacket=view(r,'d',5200);
 assert.equal(waitingPacket.phase,'waiting');
 assert.deepEqual(waitingPacket.vote.options,vote.options);
 assert.equal(waitingPacket.vote.mine,vote.options[1]);
 assert.ok(configureRoom(r,{mapVote:30},'d').error,'kurucu olmayan ayarı değiştiremez');
});
test('the packet shows the ballot, live tallies and the viewer own choice to everyone',()=>{
 const r=room(),vote=finish(r,5000),[first,second]=vote.options;
 castVote(r,r.players.b,second,5100);
 const mine=view(r,'b',5200),other=view(r,'c',5200);
 assert.deepEqual(mine.vote.options,vote.options);
 assert.equal(mine.vote.mine,second);
 assert.equal(other.vote.mine,null,'başkasının oyu kendi oyum gibi görünmez');
 // Sayımlar herkese açık: tur bitti, gizlenecek bir şey yok.
 assert.deepEqual(other.vote.counts,{[first]:0,[second]:1});
 assert.equal(other.vote.cast,1);
 assert.equal(other.vote.closed,false);
 tick(r,5000+60000,.05);
 assert.equal(view(r,'c',66000).vote.winner,second);
 // Yeni tur paketi oylamayı tamamen düşürür.
 start(r,70000);
 assert.equal(view(r,'c',70100).vote,null);
});
