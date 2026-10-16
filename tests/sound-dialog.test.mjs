import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const entry = process.env.SOUND_ENTRY || 'src/sound-dialog.js';
const dom = new JSDOM('<body></body>'); const doc = dom.window.document;
const E = dom.window.HTMLElement.prototype;
E.createEl = function(tag, opts = {}) { if (typeof opts === 'string') opts = { cls: opts }; const e = doc.createElement(tag); if(opts.cls)e.className=opts.cls;if(opts.text)e.textContent=opts.text;if(opts.type)e.type=opts.type;if(opts.value!==undefined)e.value=opts.value;if(opts.href)e.href=opts.href;for(const[k,v]of Object.entries(opts.attr||{}))e.setAttribute(k,v);this.append(e);return e; };
E.createDiv=function(o){return this.createEl('div',o);}; E.createSpan=function(o){return this.createEl('span',o);};E.setText=function(t){this.textContent=t;};E.empty=function(){this.replaceChildren();};
class Modal { constructor(){this.modalEl=doc.body.createDiv();this.contentEl=this.modalEl.createDiv();}setTitle(){}open(){this.onOpen();}close(){this.onClose();this.modalEl.remove();} }
globalThis.soundHost={Modal,setIcon:(el,icon)=>{el.dataset.icon=icon;}};
const bundle=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'host',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'host',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const {Modal,setIcon}=globalThis.soundHost;'}));}}]});
const {SoundDialog}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function fixture(){
 const calls=[],listeners=new Set();let active={id:'system',voice:'native',key:''};
 const adapter={chinese:true,current:()=>active,profile:id=>({id,voice:'one',model:'model-a',key:''}),providers:()=>[{id:'system',label:'系统'},{id:'cloud',label:'云端'},{id:'other',label:'其他'}],models:()=>[{id:'model-a',label:'A'},{id:'model-b',label:'B'}],changeModel:(p,value)=>({...p,model:value}),voices:()=>[{id:'one',label:'一号'},{id:'two',label:'二号'}],canLoad:()=>true,load:async()=>({voices:[]}),validate:p=>p.id!=='system'&&!p.key?{code:'key'}:null,error:e=>e.code,links:()=>[],subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},stop:()=>{},preview:(owner,text,p)=>calls.push({owner,text,p}),apply:async p=>{active={...p};},};
 const dialog=new SoundDialog({},adapter);dialog.open();
 return {dialog,adapter,calls,active:()=>active,emit:(state,error)=>listeners.forEach(f=>f({owner:dialog.owner,state,error})),input:(key,value)=>{const e=dialog.contentEl.querySelector(`[data-sound-field="${key}"]`);e.value=value;e.dispatchEvent(new dom.window.Event('input'));},listeners};
}
test('unconfigured provider exposes credentials, hides fake auditions and keeps active config untouched',()=>{
 const f=fixture();f.dialog.switchProvider('cloud');assert.equal(f.dialog.list.hidden,true);assert.equal(f.dialog.test.disabled,true);assert.equal(f.dialog.use.disabled,true);assert.equal(f.active().id,'system');assert.equal(f.calls.length,0);
 f.input('key','provider-one-key');assert.equal(f.dialog.test.disabled,false);assert.equal(f.dialog.list.hidden,false);f.dialog.switchProvider('other');assert.equal(f.dialog.profile.key,'');f.dialog.switchProvider('cloud');assert.equal(f.dialog.profile.key,'provider-one-key');f.dialog.close();assert.equal(f.active().id,'system');assert.equal(f.listeners.size,0);
});
test('only successful playback of exact draft enables application; changing model clears proof',async()=>{
 const f=fixture();f.dialog.switchProvider('cloud');f.input('key','sample-key');f.dialog.audition();assert.equal(f.calls.length,1);assert.equal(f.calls[0].p.key,'sample-key');assert.equal(f.dialog.use.disabled,true);f.emit('playing');assert.equal(f.dialog.use.disabled,true);f.emit('ended');assert.equal(f.dialog.use.disabled,false);
 const select=f.dialog.contentEl.querySelector('[data-sound-field=model]');select.value='model-b';select.dispatchEvent(new dom.window.Event('change'));assert.equal(f.dialog.use.disabled,true);
 f.dialog.audition();f.emit('ended');await f.dialog.apply();assert.equal(f.active().model,'model-b');assert.equal(f.active().id,'cloud');
});
test('failure retains input; retry succeeds; save failure retains draft and permits retry',async()=>{
 const f=fixture();f.dialog.switchProvider('cloud');f.input('key','sample-key');f.dialog.audition();f.emit('error',{code:'http'});assert.equal(f.dialog.use.disabled,true);assert.equal(f.dialog.profile.key,'sample-key');f.dialog.audition();f.emit('ended');f.adapter.apply=async()=>{throw Error('disk');};await f.dialog.apply();assert.equal(f.dialog.closed,undefined);assert.equal(f.dialog.use.disabled,false);assert.equal(f.active().id,'system');assert.equal(f.dialog.profile.key,'sample-key');f.dialog.close();
});
test('late catalog and preview completion cannot validate another provider or reopen closed modal',async()=>{
 const f=fixture();let done;f.adapter.load=()=>new Promise(r=>done=r);const pending=f.dialog.loadVoices();f.dialog.switchProvider('cloud');done({voices:[{id:'stale',label:'stale'}]});await pending;assert.equal(f.dialog.catalogs.size,0);
 f.input('key','sample-key');f.dialog.audition();f.dialog.switchProvider('other');f.emit('ended');assert.equal(f.dialog.verified,'');f.dialog.close();assert.equal(f.listeners.size,0);
});
test('voice search preserves query and selection does not apply or synthesize',()=>{
 const f=fixture();const input=f.dialog.contentEl.querySelector('input[type=search]');input.value='二号';input.dispatchEvent(new dom.window.Event('input'));f.dialog.list.querySelector('button').click();assert.equal(input.isConnected,true);assert.equal(input.value,'二号');assert.equal(f.dialog.profile.voice,'two');assert.equal(f.active().voice,'native');assert.equal(f.calls.length,0);f.dialog.close();
});
