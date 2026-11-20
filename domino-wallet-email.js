'use strict';
// Production delivery uses an explicitly configured Resend account and sender.
// No email or recovery secret is ever sent to the browser until a valid code
// has been presented. Local test outbox is disabled on Render.
const fs=require('node:fs');
const path=require('node:path');

function configured(){
  return !!(process.env.DOMINO_EMAIL_RESEND_API_KEY&&process.env.DOMINO_EMAIL_FROM);
}
async function sendWalletEmail(to,subject,code,purpose){
  if(typeof to!=='string'||!to||typeof code!=='string'||!/^[a-f0-9]{48}$/.test(code))
    throw Error('Invalid wallet email delivery.');
  if(process.env.RENDER!=='true'&&process.env.DOMINO_EMAIL_TEST_OUTBOX){
    const file=path.resolve(process.env.DOMINO_EMAIL_TEST_OUTBOX);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.appendFileSync(file,JSON.stringify({to,subject,code,purpose})+'\n',{mode:0o600});
    return;
  }
  if(!configured())throw Error('Verified wallet email delivery is not configured.');
  const body=purpose==='verification'
    ?'Enter this code in Jamaican Vibes Domino to verify your email address: '
    :'Enter this code in Jamaican Vibes Domino to recover your wallet: ';
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{
      'Authorization':'Bearer '+process.env.DOMINO_EMAIL_RESEND_API_KEY,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({from:process.env.DOMINO_EMAIL_FROM,to:[to],subject,
      text:body+code+'\n\nThis code expires in 15 minutes. If you did not request it, ignore this email.'}),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw Error('Wallet email delivery failed.');
}
module.exports={configured,sendWalletEmail};
