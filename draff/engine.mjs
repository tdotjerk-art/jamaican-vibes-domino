const initial=()=>Array.from({length:64},(_,i)=>((i/8|0)+i%8)%2?i<24?-1:i>=40?1:0:0);
const side=p=>Math.sign(p);
function moves(b,s,only=-1){
let a=[],j=[];
for(let i=0;i<64;i++){
 if(side(b[i])!==s||(only>=0&&i!==only))continue;
 let r=i>>3,c=i%8,king=Math.abs(b[i])===2;
 for(let dr of [-1,1])for(let dc of [-1,1]){
  if(king){
   let y=r+dr,x=c+dc,take;
   while(y>=0&&y<8&&x>=0&&x<8){
    let n=y*8+x;
    if(b[n]){if(side(b[n])===s||take!==undefined)break;take=n;}
    else if(take!==undefined)j.push({from:i,to:n,take});
    else if(only<0)a.push({from:i,to:n});
    y+=dr;x+=dc;
   }
  }else{
   let y=r+dr,x=c+dc;if(y<0||y>7||x<0||x>7)continue;
   let n=y*8+x;
   if(!b[n]&&only<0&&dr===-s)a.push({from:i,to:n});
   else if(side(b[n])===-s){let yy=y+dr,xx=x+dc;if(yy>=0&&yy<8&&xx>=0&&xx<8&&!b[yy*8+xx])j.push({from:i,to:yy*8+xx,take:n});}
  }
 }
}
return only>=0?j:j.concat(a);
}
// A missed capture may be claimed once, before the opponent moves.
function missed(b,s,m){if(m.take!==undefined)return [];return [...new Set(moves(b,s).filter(x=>x.take!==undefined).map(x=>x.from===m.from?m.to:x.from))];}
function claim(b,s,eligible,i){if(!eligible.includes(i)||side(b[i])!==-s)return null;let n=b.slice();n[i]=0;return n;}
function apply(b,m){let n=b.slice(),p=n[m.from];n[m.from]=0;n[m.to]=p;if(m.take!==undefined)n[m.take]=0;let crown=Math.abs(p)===1&&((p>0&&m.to<8)||(p<0&&m.to>=56));if(crown)n[m.to]=p*2;return {board:n,again:m.take!==undefined&&!crown&&moves(n,side(p),m.to).length>0};}
function turns(b,s){let out=[];function walk(board,path,options){for(let m of options){let n=apply(board,m),p=path.concat(m);if(n.again)walk(n.board,p,moves(n.board,s,m.to));else out.push({board:n.board,path:p});}}walk(b,[],moves(b,s));return out;}
function evaluate(b){return b.reduce((v,p,i)=>v+(p?Math.sign(p)*(Math.abs(p)===2?175:100+(p>0?7-(i>>3):i>>3)*4)+Math.sign(p)*(3.5-Math.abs(3.5-i%8))*2:0),0);}
function search(b,s,d,alpha=-Infinity,beta=Infinity){let ts=turns(b,s);if(!ts.length)return -s*100000;if(!d)return evaluate(b);let v=s===1?-Infinity:Infinity;for(let t of ts){let n=search(t.board,-s,d-1,alpha,beta);v=s===1?Math.max(v,n):Math.min(v,n);if(s===1)alpha=Math.max(alpha,v);else beta=Math.min(beta,v);if(beta<=alpha)break;}return v;}
export { initial,moves,missed,claim,apply,turns,search };
