importScripts('match.js','runpolicy.js','resume.js','tab-workers.js','engine.js');
// Only the coordinator writes the shared ledger. Engines receive disjoint rows.
let pool=[], busy=false, writeTail=Promise.resolve(), controlHandler, tabWorkers=null, runLayout='windows';
const serial=fn=>{const p=writeTail.then(fn);writeTail=p.catch(()=>{});return p;};
const clone=x=>structuredClone(x);
const keys=k=>typeof k==='string'?[k]:Array.isArray(k)?k:Object.keys(k||{});
const select=(obj,k)=>k==null?clone(obj):Object.fromEntries(keys(k).filter(n=>n in obj || (k && !Array.isArray(k) && typeof k==='object')).map(n=>[n,clone(obj[n]??k[n])]));
function partition(rows,count) {
  const groups=Array.from({length:count},()=>[]), owner=new Map();
  rows.forEach((r,i)=>{if(!owner.has(r.store)) owner.set(r.store,owner.size%count);groups[owner.get(r.store)].push(i);});
  return groups.filter(g=>g.length);
}
async function publish() {
  const live=pool.filter(w=>!w.done);
  await chrome.storage.session.set({batchRunning:busy,runSuspended:live.some(w=>w.state.runSuspended),
    workers:pool.map(w=>({id:w.id,layout:runLayout,store:w.state.currentStore||'',status:w.state.status||'Opening worker…',done:w.done,paused:!!w.state.runSuspended})),
    status:busy?`${live.length}/${pool.length} workers active. ${runLayout==='tabs'?'One window; tabs share foreground map/input turns.':'Each window processes its own stores.'}`:'All workers stopped or finished. Review the per-worker messages and store results; download the combined Excel.'});
}
function engineChrome(w) {
  const listeners=[];
  function event(real) {return {addListener(fn){real.addListener(fn);listeners.push(()=>real.removeListener(fn));}};}
  const local=w?{
    async get(k){await writeTail;const s=await chrome.storage.local.get(k);if(keys(k).includes('batchRows')) s.batchRows=w.rows;if(keys(k).includes('runCheckpoint')) s.runCheckpoint=w.checkpoint;return clone(s);},
    async set(value){const v=clone(value);return serial(async()=>{
      const out={...v};
      if(v.batchRows){const {batchRows=[]}=await chrome.storage.local.get('batchRows');w.rows=v.batchRows;w.indices.forEach((idx,j)=>batchRows[idx]=v.batchRows[j]);out.batchRows=batchRows;}
      if(v.history){const {history={}}=await chrome.storage.local.get('history');for(const r of w.rows){delete history[r.store];if(v.history[r.store]) history[r.store]=v.history[r.store];}out.history=history;}
      if(v.runCheckpoint){
        delete out.runCheckpoint;
        if(!w.recovering) {
          w.checkpoint=v.runCheckpoint;out['workerCheckpoint'+w.id]=v.runCheckpoint;
          const {savedRun}=await chrome.storage.local.get('savedRun');
          if(savedRun) {const entry=savedRun.workers.find(x=>x.id===w.id);if(entry) entry.checkpoint=v.runCheckpoint;out.savedRun=savedRun;}
        }
      }
      await chrome.storage.local.set(out);
    });},
    async remove(k){const ks=keys(k);if(ks.includes('runCheckpoint')) w.checkpoint=null;await chrome.storage.local.remove(ks.map(n=>n==='runCheckpoint'?'workerCheckpoint'+w.id:n));}
  }:chrome.storage.local;
  const session=w?{
    async get(k){return select(w.state,k);},
    async set(v){Object.assign(w.state,clone(v));await chrome.storage.session.set({['workerSession'+w.id]:w.state});await publish();},
    async remove(k){keys(k).forEach(n=>delete w.state[n]);await chrome.storage.session.set({['workerSession'+w.id]:w.state});}
  }:chrome.storage.session;
  const api={...chrome,workerTabs:w?tabWorkers:null,storage:{...chrome.storage,local,session},
    runtime:{...chrome.runtime,onMessage:{addListener(fn){if(!w) controlHandler=fn;}}},
    action:{onClicked:{addListener(){}}},
    debugger:{...chrome.debugger,onDetach:event(chrome.debugger.onDetach)},
    tabs:{...chrome.tabs,onActivated:event(chrome.tabs.onActivated)}};
  if(w) w.dispose=()=>listeners.forEach(fn=>fn());
  return api;
}
createEngine(engineChrome(null));
const DASH=chrome.runtime.getURL('dashboard.html');
chrome.action.onClicked.addListener(async()=>{
  const [tab]=await chrome.tabs.query({url:DASH});
  if(tab){await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});}
  else await chrome.tabs.create({url:DASH});
});
async function start(message,sender) {
  if(busy) throw new Error('Workers are already running.');
  busy=true; // lock before any asynchronous read or window creation
  try {
    const saved=message.action==='resumeSaved'?(await chrome.storage.local.get('savedRun')).savedRun:null;
    if(message.action==='resumeSaved' && !saved) throw new Error('No saved run. Start a run first.');
    const mode=saved?saved.mode:message.mode;
    runLayout=saved?(saved.layout||'windows'):(message.layout||'windows');
    if(!['tabs','windows'].includes(runLayout)) throw new Error('Choose tabs or windows.');
    tabWorkers=runLayout==='tabs'?createTabWorkers(chrome):null;
    if(mode!=='check') RunPolicy.options(mode);
    const {batchRows=[]}=await chrome.storage.local.get('batchRows');
    if(!batchRows.length) throw new Error('Load your sheet first.');
    if(!saved && mode!=='check' && batchRows.some(r=>r.detailsReview||['processing','saving','submitted_review'].includes(r.status))) throw new Error('Review interrupted stores using “I reviewed it” before starting.');
    const requested=Number(message.concurrency??4);
    if(!Number.isInteger(requested)||requested<1||requested>20) throw new Error('Choose 1 to 20 workers.');
    if(saved && JSON.stringify(saved.queueKeys)!==JSON.stringify(ResumePlan.keys(batchRows))) throw new Error('Queue changed. Start a new run.');
    const entries=saved?saved.workers.filter(w=>!w.checkpoint?.complete):partition(batchRows,requested).map((indices,i)=>({id:i+1,indices,checkpoint:null}));
    if(!entries.length) throw new Error('The saved run is complete.');
    pool=entries.map(e=>({...e,rows:e.indices.map(n=>clone(batchRows[n])),state:{},done:false,resuming:!!saved}));
    if(!saved) await chrome.storage.local.set({savedRun:{mode,layout:runLayout,createdAt:new Date().toISOString(),queueKeys:ResumePlan.keys(batchRows),workers:entries}});
    for(const w of pool) {
      // Retain stopped windows for manual inspection, but never reuse their editor state.
      w.engine=createEngine(engineChrome(w));
    }
    await publish();
    void Promise.allSettled(pool.map(async w=>{
      try {
        const tab=await w.engine.findBusinessTab(sender.tab?.windowId);
        if(w.stopBeforeStart) {w.state.status='Stopped before processing. No edits made.';return;}
        const cp=w.checkpoint, from=w.resuming?ResumePlan.start(cp):0;
        if(mode==='check' || cp?.phase==='check') await w.engine.runChecks(tab,from);
        else {
          if(w.resuming && cp) {
            // Read the overlap and interrupted store before authorizing any repeat write.
            for(let i=from;i<=cp.index && i<w.rows.length;i++) {
              delete w.rows[i].checkedAt;
              for(const t of w.rows[i].targets||[]) {delete t.verify;delete t.coordinates;}
            }
            await engineChrome(w).storage.local.set({batchRows:w.rows});
            w.recovering=true;
            try {await w.engine.runChecks(tab,from,0,Math.min(w.rows.length,(cp.index||0)+1));}
            finally {w.recovering=false;}
            if(w.stopBeforeStart) return;
            const recovered=ResumePlan.reconcile(w.rows,from,cp.index||0,mode);
            await engineChrome(w).storage.local.set({batchRows:recovered});
          }
          await w.engine.runBatch(tab,{...RunPolicy.options(mode),startIndex:from});
        }
      } catch(e) {w.state.status='Stopped: '+e.message;}
      finally {w.done=true;w.dispose();await publish();}
    })).then(async()=>{busy=false;await publish();});
    return {started:true,workers:pool.length};
  } catch(e){busy=false;await chrome.storage.session.set({batchRunning:false});throw e;}
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  const dashboard=String(s.url||'').startsWith(DASH);
  const page=!!s.tab && /^https:\/\/business\.google\.com\//.test(s.url||'');
  if(s.id!==chrome.runtime.id||(!dashboard&&!page)) return false;
  if(page&&!['pageState','stop','resume'].includes(m.action)) return false;
  (async()=>{
    const own=pool.find(w=>w.engine.state().tabId===s.tab?.id);
    if(m.action==='pageState'){const a=own?.engine.state();return {running:!!a?.running,suspended:!!a?.suspended,store:a?.store||'',canResume:!!a?.suspended,ownTab:!!own};}
    if(m.action==='start' || m.action==='resumeSaved') return start(m,s);
    if(['stop','pause','resume'].includes(m.action)) {
      if(!busy) throw new Error('No active workers. Use Start selected option in the dashboard.');
      const selected=page?(own?[own]:[]):pool.filter(w=>!w.done);
      for(const w of selected) {
        if(m.action==='pause'){w.stopBeforeStart=true;w.engine.pause();if(w.engine.state().suspended) await w.engine.resumeRun();}
        else if(m.action==='stop'){if(!w.engine.state().running) w.stopBeforeStart=true;else await w.engine.suspendRun('Stopped by you');}
        else if(w.engine.state().suspended) await w.engine.resumeRun();
      }
      await publish();return {ok:true};
    }
    if(busy) throw new Error('Pause after current stores and wait for all workers to finish first.');
    const result=await new Promise(resolve=>controlHandler(m,s,resolve));
    if(['import','clear'].includes(m.action) && !result?.error) await chrome.storage.local.remove('savedRun');
    return result;
  })().then(reply).catch(e=>reply({error:e.message}));
  return true;
});
// A restarted worker never resumes an ambiguous save automatically.
chrome.storage.session.set({batchRunning:false,runSuspended:false,workers:[],status:'Ready. Use Resume saved run to continue after a browser restart, with a one-store overlap per worker.'});
