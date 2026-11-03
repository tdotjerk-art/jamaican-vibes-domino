const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {finishBlocked,finishWin,nextHand,applyBruckAndStartWin}=require('../server');
const {partnerWin}=require('../public/mobile-layout');
function room(){return {code:'TIE-POINTS',mode:'partner',players:Array.from({length:4},(_,seat)=>({seat,name:`P${seat+1}`,connected:true})),spectators:new Map(),rematchVotes:new Set(),history:[],hands:[[{a:0,b:3}],[{a:1,b:2}],[{a:4,b:4}],[{a:5,b:5}]],board:[],handNo:1,handValue:1,phase:'playing',turn:0,scores:[0,0,0,0],teamScores:[0,0],bruckStartTeam:null,bruckStartCount:0,oneOnePlayTwo:false,nextPlayFor:1,lastWinnerTeam:null};}
function cleanup(r){clearTimeout(r.timer);clearTimeout(r.restartTimer);}
for(const blocked of [false,true])test(`0-0 then blocked tie awards TWO for the following ${blocked?'blocked':'normal'} win`,()=>{
 const r=room();try{
 finishBlocked(r);assert.equal(r.tiedCarry,true);assert.deepEqual(r.teamScores,[0,0]);
 nextHand(r);assert.equal(r.handValue,2);assert.equal(r.board[0].a,6);assert.equal(r.board[0].b,6);
 if(blocked){r.hands=[[{a:0,b:0}],[{a:1,b:2}],[{a:2,b:2}],[{a:3,b:3}]];finishBlocked(r);}else finishWin(r,0);
 assert.deepEqual(r.teamScores,[2,0]);assert.equal(r.bruckStartCount,2);
 nextHand(r);assert.equal(r.handValue,1,'next ordinary hand returns to one');
 }finally{cleanup(r)}
});
test('repeated ties remain worth two and a win from five stops at six',()=>{
 const r=room();try{for(let n=0;n<2;n++){r.hands=room().hands;finishBlocked(r);nextHand(r);assert.equal(r.handValue,2);assert.deepEqual(r.teamScores,[0,0]);}finishWin(r,1);assert.deepEqual(r.teamScores,[0,2]);}finally{cleanup(r)}
 for(const score of [applyBruckAndStartWin,partnerWin]){const state={handValue:2,bruckStartTeam:0,bruckStartCount:5,oneOnePlayTwo:false};assert.equal(score(state,0).won,true);assert.deepEqual(state.teamScores,[6,0]);}
});
test('local computer-game adapter carries the two-point hand into actual scores',()=>{
 const source=fs.readFileSync(require.resolve('../public/mobile-layout'),'utf8');
 const adapter=source.match(/root\.applyOfflineBruckAndStartWin=function\(winner\)\{[\s\S]*?\n    \};/)[0];
 const context={root:{},partnerWin,handValue:2,offlineBruckTeam:null,offlineBruckCount:0,offlineOneOnePlayTwo:false,offlineNextPlayFor:1,scores:[0,0,0,0]};vm.createContext(context);vm.runInContext(adapter,context);
 context.root.applyOfflineBruckAndStartWin(2);assert.deepEqual(Array.from(context.scores),[2,0,0,0]);assert.equal(context.offlineBruckCount,2);assert.equal(context.offlineNextPlayFor,1);
 context.handValue=1;context.root.applyOfflineBruckAndStartWin(0);assert.equal(context.scores[0],3);
});
