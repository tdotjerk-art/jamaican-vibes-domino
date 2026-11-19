'use strict';
// Release-readiness gate; never modifies services or enables credits.
// Usage: node scripts/check-credit-release-gate.cjs
const fs=require('node:fs'),assert=require('node:assert/strict');
const p=JSON.parse(fs.readFileSync('package-lock.json','utf8')).packages;
assert.equal(p['node_modules/body-parser']?.version,'2.4.0','Use audited production body-parser lockfile');
assert.equal(p['node_modules/qs']?.version,'6.17.1','Use audited production qs lockfile');
const checklist=fs.readFileSync('docs/domino-credit-release-checklist.md','utf8');
const main=checklist.split('## Must be completed before activation')[1]?.split('## Release procedure')[0];
assert.ok(main,'Missing mandatory release gates');
const blockers=main.split('\n').filter(x=>/^\s*- \[ \]/.test(x));
const required=[
  'Render disk','Node.js version','identity','iPhone','advertis','restart','approval'
];
const server=fs.readFileSync('server.js','utf8');
assert.match(server,/DOMINO_CREDITS_ENABLED/);
assert.match(server,/DOMINO_CREDIT_DURABLE_CONFIRMED/);
assert.match(server,/DOMINO_CREDIT_STORAGE/);
const summary={dependencyPatches:'current',deploymentDefault:'credits off',unresolvedGates:blockers.length,requirements:required.map(x=>({name:x,found:checklist.toLowerCase().includes(x.toLowerCase())}))};
console.log('CREDIT_RELEASE_GATE '+JSON.stringify(summary));
if(blockers.length){
  console.error('BLOCKED: Credit activation is not approved. Outstanding required checklist items:');
  blockers.forEach((x,i)=>console.error('  '+(i+1)+'. '+x.replace(/^\s*- \[ \]\s*/,'').slice(0,185)));
  process.exitCode=1;
}
