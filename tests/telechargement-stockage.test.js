const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'portal-api.js'), 'utf8');
const session = JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600});

async function scenario(statuses, expectedCalls, succeeds) {
  let calls = 0;
  const context = {
    window: {},
    sessionStorage: {getItem:()=>session,setItem:()=>{},removeItem:()=>{}},
    location: {hash:'',pathname:'/eleve.html'},
    URLSearchParams,
    Date,
    Promise,
    AbortController,
    setTimeout: callback => callback(),
    clearTimeout: () => {},
    fetch: async () => {
      const status = statuses[calls++];
      return {ok:status===200,status,blob:async()=>({size:8,type:'image/png'})};
    }
  };
  vm.runInNewContext(source,context);
  const result=context.window.MelecPortal.download('tp/test.pdf');
  if(succeeds) assert.equal((await result).size,8);
  else await assert.rejects(result);
  assert.equal(calls,expectedCalls);
}

(async()=>{
  await scenario([544,200],1,false);
  await scenario([503,200],1,false);
  await scenario([403],1,false);
  await scenario([200],1,true);
  console.log('Storage single request: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
