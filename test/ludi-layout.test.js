const test=require('node:test'),A=require('node:assert/strict'),E=require('../public/ludo/engine'),L=require('../public/ludo/layout');
test('reference board has continuous long lanes, one cell per corner, and no overlapping playable spaces',()=>{
 const cells=E.TRACK.slice();
 for(let color=0;color<4;color++)for(let step=E.OUTER_LAST+1;step<E.HOME;step++)cells.push(E.coordinate({color},step));
 A.equal(cells.length,68);A.equal(new Set(cells.map(p=>p.join(','))).size,68);
 const boxes=cells.map(([r,c])=>({x:L.edge(c),y:L.edge(r),w:L.edge(c+1)-L.edge(c),h:L.edge(r+1)-L.edge(r)}));
 A.equal(L.edge(6),228);A.equal(L.edge(7),372);A.equal(L.edge(13),600);
 for(let i=0;i<boxes.length;i++){
  const a=boxes[i];A.ok(a.x>=0&&a.y>=0&&a.x+a.w<=600.001&&a.y+a.h<=600.001);
  A.ok(Math.abs(a.w-(L.edge(7)-L.edge(6)))<.001||Math.abs(a.h-(L.edge(7)-L.edge(6)))<.001||Math.abs(a.w-L.UNIT)<.001);
  for(const b of boxes.slice(i+1))A.ok(a.x+a.w<=b.x+.001||b.x+b.w<=a.x+.001||a.y+a.h<=b.y+.001||b.y+b.h<=a.y+.001);
 }
 // Each of the six long bars follows the photographed green/gold/black sequence.
 A.deepEqual(Array.from({length:6},(_,r)=>L.paint(r,6)),['#08753c','#f4cf22','#080b08','#08753c','#f4cf22','#080b08']);
});
test('all four yards arrange pieces in the single-file rows shown in the photo',()=>{
 for(let color=0;color<4;color++){
  const h=L.home(color),pieces=Array.from({length:4},(_,p)=>L.yard(color,p));
  A.ok(h.width<600/18*5);A.equal(h.width,h.height);A.ok(L.UNIT>600/18);
  A.equal(new Set(pieces.map(p=>p[color===0||color===2?0:1])).size,1);
  for(let i=0;i<4;i++){
   A.ok(pieces[i][0]-15.4>=h.x&&pieces[i][0]+15.4<=h.x+h.width);
   A.ok(pieces[i][1]-15.4>=h.y&&pieces[i][1]+15.4<=h.y+h.height);
   for(const p of pieces.slice(i+1))A.ok(Math.hypot(pieces[i][0]-p[0],pieces[i][1]-p[1])>30.8);
  }
 }
});
