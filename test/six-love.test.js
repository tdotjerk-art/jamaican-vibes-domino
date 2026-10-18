const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {applyBruckAndStartWin}=require('../server');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('either partner team finishes at six-love without advancing to seven',()=>{
 for(const team of [0,1]){
  const r={bruckStartTeam:team,bruckStartCount:5,teamScores:[0,0],oneOnePlayTwo:false};
  assert.equal(applyBruckAndStartWin(r,team).won,true);
  assert.equal(r.teamScores[team],6);assert.equal(r.teamScores[1-team],0);
  applyBruckAndStartWin(r,team);assert.equal(r.teamScores[team],6);
 }
});
test('local six-love stops clocks, ends the match and blocks another deal',()=>{
 const start=html.indexOf('function checkMatchEnd(){');const code=html.slice(start,html.indexOf('\nfunction showRules()',start));
 let stopped=0,result='';
 const ctx={mode:'partner',scores:[7,0],localMatchOver:false,gameOver:false,stopTurnTimer(){stopped++;},stopPoseTimer(){stopped++;},renderScores(){},showResult:s=>result=s};
 vm.createContext(ctx);vm.runInContext(code+'\ncheckMatchEnd();',ctx);
 assert.equal(ctx.scores[0],6);assert.equal(ctx.scores[1],0);assert.equal(ctx.localMatchOver,true);assert.equal(ctx.gameOver,true);assert.equal(stopped,2);assert.match(result,/MATCH WINNER/);
 const dealStart=html.indexOf('function dealHand('),deal=html.slice(dealStart,html.indexOf('\nlet pendingPosePlayer=',dealStart));
 ctx.clearBlockedCounts=()=>{throw Error('A finished match must not deal again');};
 vm.runInContext(deal+'\ndealHand(false);',ctx);
});
