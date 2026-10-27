(function(root){
 'use strict';
 // Smaller home zones leave more room for the playable track.
 const UNIT=43,CENTER=600-12*UNIT;
 const edge=n=>n<=6?n*UNIT:6*UNIT+CENTER+(n-7)*UNIT;
 const middle=n=>(edge(n)+edge(n+1))/2;
 const palettes={B:'#080b08',G:'#08753c',Y:'#f4cf22'};
 function paint(r,c){
  let code;
  if(c===5&&r<=5)code='BYGBYG'[r];
  else if(c===7&&r<=5)code='YBGYBG'[r];
  else if(r===5&&c<=5)code='YBBYBG'[c];
  else if(r===7&&c<=5)code='BYGBYG'[c];
  else if(r===5&&c>=7)code='GYBGYB'[c-7];
  else if(r===7&&c>=7)code='GBYGBY'[c-7];
  else if(c===5&&r>=7)code='GBYGBY'[r-7];
  else if(c===7&&r>=7)code='GYBGYB'[r-7];
  else if(c===6&&r<=5)code='GYBGYB'[r];
  else if(r===6&&c<=5)code='GYBGYB'[c];
  else if(r===6&&c>=7)code='BYGBYG'[c-7];
  else if(c===6&&r>=7)code='BYGBYG'[r-7];
  return palettes[code||'B'];
 }
 function home(color){const [x,y]=[[0,0],[edge(8),0],[edge(8),edge(8)],[0,edge(8)]][color];const inset=26;return {x:x+inset,y:y+inset,width:edge(5)-2*inset,height:edge(5)-2*inset};}
 function yard(color,piece){const h=home(color),along=24+26*piece;return color===0?[h.x+24,h.y+along]:color===1?[h.x+along,h.y+24]:color===2?[h.x+h.width-16,h.y+along]:[h.x+along,h.y+h.height-16];}
 function finished(color,piece){const near=edge(6)+12,far=edge(7)-12,along=264+24*piece;return color===0?[near,along]:color===1?[along,near]:color===2?[far,along]:[along,far];}
 const api={UNIT,edge,middle,paint,home,yard,finished};if(typeof module!=='undefined')module.exports=api;else root.JVLudiLayout=api;
})(globalThis);
