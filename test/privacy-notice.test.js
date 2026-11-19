'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('privacy notice includes actual analytics storage and advertising disclosures',()=>{
 const policy=read('public/privacy.html');
 for(const part of ['<title>Privacy Policy','jv_analytics_browser','local storage','90 days','Google','microphone','Privacy Policy','https://github.com/tdotjerk-art/jamaican-vibes-domino/issues/new'])assert.ok(policy.includes(part),part);
});

test('each additional game links to the privacy notice',()=>{
 for(const file of ['public/ludi/index.html','public/draff/index.html','public/three-cards.html','public/holdem/index.html']){
  assert.match(read(file),/href="\/privacy\.html"/,file);
 }
});

test('Domino home HTML inserts the policy link without modifying gameplay',()=>{
 const server=read('server.js');
 assert.match(server,/html\.replace\("Single Player works locally\./);
 assert.match(server,/href=\\"\/privacy\.html\\"/);
});
