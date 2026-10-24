(function(root){
 'use strict';
 // The reference has a six-unit center, narrow outer squares, and five-unit yards.
 const UNIT=600/18;
 const edge=n=>n<=6?n*UNIT:400+(n-7)*UNIT;
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
 function yard(color,piece){return color===0?[46,28+32*piece]:color===1?[460+32*piece,44]:color===2?[562,460+32*piece]:[28+32*piece,562];}
 function finished(color,piece){const centers=[[224,298],[300,224],[376,298],[300,350]],p=centers[color];return [p[0]+(piece%2?9:-9),p[1]+(piece<2?-9:9)];}
 const api={UNIT,edge,middle,paint,yard,finished};if(typeof module!=='undefined')module.exports=api;else root.JVLudiLayout=api;
})(globalThis);
