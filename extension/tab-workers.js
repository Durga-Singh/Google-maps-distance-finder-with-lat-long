/* One automation window; FIFO ownership for foreground input and map saves. */
function createTabWorkers(chrome) {
  let opening=null,tail=Promise.resolve(),owner=null;
  const ids=new Set();
  return {
    enabled:true,
    owns:tabId=>owner===tabId,
    async open(url) {
      let first=false;
      if(!opening) {first=true;opening=chrome.windows.create({url,type:'normal',state:'normal',focused:false,width:1280,height:900});}
      const win=await opening;
      const tab=first?win.tabs?.[0]:await chrome.tabs.create({windowId:win.id,url,active:false});
      if(!tab) throw new Error('Could not create worker tab.');
      ids.add(tab.id);return {...win,tabs:[tab]};
    },
    async run(tabId,fn) {
      if(owner===tabId) return fn();
      const previous=tail;let release;
      tail=new Promise(resolve=>{release=resolve;});
      await previous;
      try {
        if(!ids.has(tabId)) throw new Error('Worker tab is no longer available.');
        const tab=await chrome.tabs.get(tabId);
        const win=await chrome.windows.get(tab.windowId);
        if(win.state==='minimized') await chrome.windows.update(win.id,{state:'normal',focused:false});
        owner=tabId;
        await chrome.tabs.update(tabId,{active:true});
        return await fn();
      } finally {owner=null;release();}
    },
    async close(tabId) {
      ids.delete(tabId);
      try {await chrome.tabs.remove(tabId);} catch {}
    }
  };
}
if(typeof module!=='undefined') module.exports=createTabWorkers;
