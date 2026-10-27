const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../engine.js'), 'utf8');
const preview = source.slice(source.indexOf('  function readSavedPreview()'), source.indexOf("  if(kind === 'coordinatesRead'"));
const reader = source.slice(source.indexOf('function distanceMeters('), source.indexOf('function refreshedChecks('));

function fixture(options = {}) {
  const map = {getBoundingClientRect: () => ({left:950,top:644,width:316,height:376})};
  const link = {href: options.href || 'https://www.google.com/maps/@28.442553,77.019863,15z/data=!10m1!1e1?source=apiv3', name:'Report a map error (opens in new tab)'};
  const wrapper = {contains: e => e === map, getAttribute: () => options.centre === false ? 'false' : 'true', querySelectorAll: () => options.duplicateLink ? [link,link] : [link]};
  const pin = {parentElement:{parentElement:wrapper}, getBoundingClientRect: () => ({left:1085+(options.offset||0),width:46,height:66,bottom:832})};
  const scope = {getAttribute:k=>k==='aria-label'?'Business location':null, querySelectorAll:s=>s.includes('svg')?(options.noPin?[]:[pin]):[map]};
  return {document:{querySelectorAll:()=>options.duplicateRegion?[scope,scope]:[scope]}, visible:()=>true, controls:()=>[{name:'Adjust'},...(options.adjusting?[{name:'Done'}]:[])], name:e=>e.name, getComputedStyle:()=>({position:'absolute'}), URL};
}
function readPreview(options) {return vm.runInNewContext(preview+';readSavedPreview()',fixture(options));}
assert.equal(readPreview().latitude,28.442553);
assert.equal(readPreview().longitude,77.019863);
for (const bad of [{noPin:true},{centre:false},{offset:2},{adjusting:true},{duplicateLink:true},{duplicateRegion:true},
  {href:'https://example.com/maps/@28,77,15z/?source=apiv3'},
  {href:'https://www.google.com/maps/@91,77,15z/?source=apiv3'},
  {href:'https://www.google.com/maps/@28,77,15z/'},
  {href:'https://www.google.com/maps/@28,77,99z/?source=apiv3'}]) assert.equal(readPreview(bad).count,0,JSON.stringify(bad));

async function read(sequence, row={latitude:28.4425525,longitude:77.0198628}) {
  let calls=0;
  const context={Number,Date,Math,STORE:'B7300',IDX:0,inspectUI(){},wait:async()=>{},readPage:async request=>{
    assert.equal(request.args[0],'savedCoordinatesRead');
    return sequence[Math.min(calls++,sequence.length-1)];
  }};
  const fn=vm.runInNewContext(reader+';readSavedCoordinates',context);
  return {result:await fn(123,row),calls};
}
const hit=(latitude=28.442553,longitude=77.019863,source='saved-centred-pin-preview')=>[{result:{count:1,latitude,longitude,source}}];
(async()=>{
  let r=await read([hit()]);assert.equal(r.result.status,'match');assert.equal(r.calls,3);assert.ok(r.result.distance<0.1);
  r=await read([hit(28.45)]);assert.equal(r.result.status,'mismatch');assert.ok(r.result.distance>500);
  r=await read([[],[],[],[],[],hit()]);assert.equal(r.result.status,'match');assert.equal(r.calls,8);
  r=await read([[]]);assert.equal(r.result.status,'unconfirmed');assert.equal(r.calls,12);assert.equal(r.result.latitude,undefined);
  r=await read([[...hit(),...hit()]]);assert.equal(r.result.status,'unconfirmed');
  r=await read([hit(),hit(28.442553,77.019863,'numeric-fields'),hit()]);assert.equal(r.calls,5);
  r=await read(Array.from({length:12},(_,i)=>hit(28+i*.001)));assert.equal(r.result.status,'unconfirmed');
  assert.ok(source.includes("args:['coordinatesRead',false,STORE,IDX]"),'Draft reading retains its separate numeric-only path');
  console.log('PASS: saved preview guards, delayed loading, stable readback, mismatch, ambiguity and draft separation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
