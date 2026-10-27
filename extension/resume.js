/* Durable run planning. No browser or page writes in this module. */
(function(root){
  const keys=rows=>rows.map(r=>JSON.stringify([r.store,r.latitude,r.longitude,r.name,r.address,r.address2,r.address3,r.locality,r.admin,r.postal,r.sheetSkip]));
  const start=cp=>Math.max(0,(Number.isInteger(cp?.index)?cp.index:0)-1);
  function reconcile(rows,from,to,mode) {
    const result=structuredClone(rows);
    for(let i=from;i<=to && i<result.length;i++) {
      const r=result[i];
      if(!r.detailsReview && !['processing','saving','submitted_review'].includes(r.status)) continue;
      const targets=(r.targets||[]).filter(t=>!t.skip);
      if(r.checkError || !r.checkedAt || !targets.length || targets.some(t=>!['match','mismatch'].includes(t.coordinates?.status) || !t.verify || ['error','none'].includes(t.verify.status)))
        throw new Error(r.store+': interrupted save could not be verified. No repeat Save was attempted. Check this store, then use Resume saved run again.');
      if(mode==='coords_address' && targets.some(t=>Object.values(t.verify).some(v=>v && typeof v==='object' && v.got==null)))
        throw new Error(r.store+': interrupted fields could not be read. Resume remains saved; no repeat Save attempted.');
      for(const t of targets) {
        t.coordDone=t.coordinates.status==='match';
        for(const k of Object.keys(t.detail||{})) {
          if(t.verify[k]) t.detail[k]=t.verify[k].ok?'ok':'failed';
          else if(['pending','review'].includes(t.detail[k])) t.detail[k]='failed';
        }
      }
      r.detailsReview=false;
      r.status=targets.every(t=>t.coordDone)?'submitted':'queued';
      r.error='';r.note='Recovered after interruption using fresh saved-coordinate and field checks.';
    }
    return result;
  }
  root.ResumePlan={keys,start,reconcile};
  if(typeof module!=='undefined') module.exports=root.ResumePlan;
})(globalThis);
