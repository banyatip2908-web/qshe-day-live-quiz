import test from 'node:test';
import assert from 'node:assert/strict';
import {countAnsweredPlayers} from '../src/logic.mjs';

function session(size,roundId=1){
 const players=new Map();
 for(let i=0;i<size;i++){
   const id='player-'+i;
   players.set(id,{id,roundId,answers:{}});
 }
 return {players,roster:[...players.keys()]};
}
test('50-player round remains open at 49 answers and is ready to reveal at 50',()=>{
 const {players,roster}=session(50);
 for(let i=0;i<49;i++)players.get(roster[i]).answers[0]={selected:1};
 assert.equal(countAnsweredPlayers(players,roster,1,0),49);
 players.get(roster[49]).answers[0]={selected:2};
 assert.equal(countAnsweredPlayers(players,roster,1,0),50);
 assert.equal(countAnsweredPlayers(players,roster,1,1),0);
});
test('a reconnected player or a repeated ID cannot increase the total',()=>{
 const {players,roster}=session(6);
 players.get(roster[0]).answers[0]={selected:0};
 assert.equal(countAnsweredPlayers(players,[roster[0],roster[0],...roster],1,0),1);
 players.get('late-player')?.answers;
 players.set('late-player',{id:'late-player',roundId:1,answers:{0:{selected:0}}});
 assert.equal(countAnsweredPlayers(players,roster,1,0),1);
});
test('an earlier round answer never counts toward a new round',()=>{
 const {players,roster}=session(3,1);
 players.get(roster[0]).answers[0]={selected:0};
 assert.equal(countAnsweredPlayers(players,roster,2,0),0);
 players.get(roster[0]).roundId=2;
 assert.equal(countAnsweredPlayers(players,roster,2,0),1);
});
test('zero players and absent answers do not trigger a completed round',()=>{
 const {players,roster}=session(100);
 assert.equal(countAnsweredPlayers(players,roster,1,0),0);
 assert.equal(countAnsweredPlayers(players,[],1,0),0);
 assert.equal(countAnsweredPlayers(players,null,1,0),0);
});
