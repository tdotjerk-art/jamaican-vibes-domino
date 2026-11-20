'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.join(__dirname,'..');
function gate(...args){
  return spawnSync(process.execPath,['scripts/check-credit-release-gate.cjs',...args],{
    cwd:root,encoding:'utf8',timeout:15000
  });
}
test('incomplete credit release stays blocked by default',()=>{
  const result=gate();
  assert.equal(result.status,1,'Default gate MUST reject incomplete launch');
  assert.match(result.stdout,/"status":"NOT_APPROVED"/);
  assert.match(result.stderr,/BLOCKED: Credit activation is not approved/);
});
test('audit-only reports same blockers without claiming launch approval',()=>{
  const result=gate('--audit-only');
  assert.equal(result.status,0,'Informational readiness reporting must not fail CI');
  assert.match(result.stdout,/"status":"NOT_APPROVED"/);
  assert.match(result.stdout,/"mode":"informational-audit"/);
  assert.match(result.stderr,/BLOCKED: Credit activation is not approved/);
});
