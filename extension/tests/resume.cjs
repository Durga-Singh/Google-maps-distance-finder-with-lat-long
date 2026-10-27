const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'), P=require('../resume.js');
assert.equal(P.start({index:500}),499);assert.equal(P.start({index:0}),0);assert.equal(P.start(null),0);
const row={store:'A',status:'saving',detailsReview:true,checkedAt:'now',targets:[{coordinates:{status:'match'},verify:{status:'ok',address:{ok:true,got:'x'}},detail:{address:'review'}}]};
let rows=P.reconcile([row],0,0,'coords_address');assert.equal(rows[0].status,'submitted');assert.equal(rows[0].detailsReview,false);assert.equal(row.status,'saving');
const mismatch=structuredClone(row);mismatch.targets[0].coordinates.status='mismatch';assert.equal(P.reconcile([mismatch],0,0,'coords_address')[0].status,'queued');
const unknown=structuredClone(row);unknown.targets[0].coordinates.status='unconfirmed';assert.throws(()=>P.reconcile([unknown],0,0,'coords_address'),/could not be verified/);
const group=[{store:'A',status:'submitted'},{store:'B',status:'queued'},{store:'C',status:'submitted'},{store:'D',status:'queued'}];
let local={batchRows:group},session={},calls=[];
const storage=obj=>({get:async k=>k==null?structuredClone(obj):Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,structuredClone(obj[x])])),set:async v=>Object.assign(obj,structuredClone(v)),remove:async k=>(Array.isArray(k)?k:[k]).forEach(x=>delete obj[x])});
const event={addListener(){},removeListener(){}};
function context(){
 const chrome={storage:{local:storage(local),session:storage(session)},runtime:{getURL:x=>'ext://'+x,onMessage:event},action:{onClicked:event},debugger:{onDetach:event},tabs:{onActivated:event}};
 const c={chrome,structuredClone,console,RunPolicy:require('../runpolicy.js'),ResumePlan:P,importScripts(){},createEngine:api=>({
 findBusinessTab:async()=>123,state:()=>({}),dispose(){},
 runChecks:async(tab,from,target,end)=>{calls.push(['check',from,end]);if(end==null) await api.storage.local.set({runCheckpoint:{complete:true}});else await api.storage.local.set({runCheckpoint:{phase:'check',index:from}});},
 runBatch:async(tab,opts)=>{calls.push(['update',opts.startIndex]);await api.storage.local.set({runCheckpoint:{complete:true}});}
 })};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'worker.js'),'utf8'),c);return c;
}
(async()=>{
 let c=context();
 local.savedRun={mode:'coords_address',queueKeys:P.keys(group),workers:[{id:1,indices:[0,2],checkpoint:{complete:true}},{id:2,indices:[1,3],checkpoint:{phase:'update',index:1,store:'D'}}]};
 // A new coordinator represents closing and restarting the browser.
 c=context();await vm.runInContext("start({action:'resumeSaved'}, {})",c);
 for(let i=0;i<20;i++) await new Promise(setImmediate);
 assert.deepEqual(calls,[['check',0,2],['update',0]]);
 assert.equal(local.savedRun.workers[0].checkpoint.complete,true);
 assert.equal(local.savedRun.workers[1].checkpoint.complete,true);
 calls=[];local.savedRun.workers[1].checkpoint={phase:'check',index:1};c=context();await vm.runInContext("start({action:'resumeSaved'}, {})",c);
 for(let i=0;i<20;i++) await new Promise(setImmediate);
 assert.deepEqual(calls,[['check',0,undefined]]);
 local.savedRun.workers[1].checkpoint=null;local.batchRows[0].store='changed';c=context();await assert.rejects(()=>vm.runInContext("start({action:'resumeSaved'}, {})",c),/Queue changed/);
 console.log('PASS: restart restores assignments, skips completed workers, overlaps one store, preserves check phase, rejects changed queues, safely reconciles interrupted saves.');
})().catch(e=>{console.error(e);process.exitCode=1;});
