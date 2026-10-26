import test from 'node:test';import assert from 'node:assert/strict';
import {ThumbnailStore} from '../src/thumbnail-store.js';import {libraryWindow} from '../src/library-virtual.js';
function fixture(){const files=new Map(),writes=[];return {files,writes,adapter:{exists:async p=>files.has(p),mkdir:async p=>files.set(p,null),writeBinary:async(p,b)=>{files.set(p,b);writes.push(p);},getResourcePath:p=>'app://'+p,rmdir:async p=>{for(const k of files.keys())if(k.startsWith(p))files.delete(k);}}};}
test('covers are individual binary writes, invalidated by book changes',async()=>{
 const f=fixture(),cache=new ThumbnailStore(f.adapter,'thumbs',async()=>new Uint8Array([1,2]).buffer),book={path:'书.epub',stat:{mtime:1,size:10}};
 const url=await cache.put(book,'image');assert.equal(await cache.get(book),url);assert.equal(f.writes.length,1);assert.ok(f.writes[0].endsWith('.jpg'));
 book.stat.mtime++;assert.equal(await cache.get(book),null);await cache.put(book,'image');assert.equal(f.writes.length,2);assert.ok(!f.writes.some(x=>x.endsWith('.json')));
});
test('clear waits for inflight encoding and does not resurrect files',async()=>{
 const f=fixture();let resolve;const cache=new ThumbnailStore(f.adapter,'thumbs',()=>new Promise(r=>{resolve=r;}));
 const pending=cache.put({path:'a'},'image');while(!resolve)await new Promise(r=>setImmediate(r));const clear=cache.clear();resolve(new ArrayBuffer(1));await Promise.all([pending,clear]);assert.equal(f.writes.length,0);assert.equal(f.files.size,0);
});
test('ten thousand books render a bounded window including the last book',()=>{
 for(const top of [0,350,300000,2000000]){const s=libraryWindow(10000,5,360,top,800);assert.ok(s.end-s.start<=40);assert.ok(s.start>=0);assert.ok(s.end<=10000);}
 const last=libraryWindow(10000,5,360,719500,800);assert.equal(last.end,10000);assert.equal(last.after,0);
});

test('virtual bookshelf scrolls its grid, keeps keyboard access and releases listeners', async () => {
 const {JSDOM}=await import('jsdom');const {mountLibraryWindow}=await import('../src/library-virtual.js');
 const dom=new JSDOM('<main><div id="grid" style="grid-template-columns:150px 150px;row-gap:20px"></div></main>',{pretendToBeVisual:true});
 const {window}=dom;window.ResizeObserver=class{observe(){}disconnect(){}};
 window.HTMLElement.prototype.setCssProps=function(props){for(const [key,value] of Object.entries(props))this.style.setProperty(key,value);};
 const grid=window.document.getElementById('grid');Object.defineProperty(grid,'clientHeight',{value:600});
 const files=Array.from({length:10000},(_,i)=>({name:String(i)}));
 const dispose=mountLibraryWindow(grid,files,(host,file)=>{const card=window.document.createElement('div');card.className='qiaomu-reader-lib-card';card.tabIndex=0;card.textContent=file.name;card.getBoundingClientRect=()=>({height:280});host.append(card);});
 const wait=()=>new Promise(r=>window.setTimeout(r,40));await wait();
 grid.scrollTop=1499700;grid.dispatchEvent(new window.Event('scroll'));await wait();
 assert.ok(grid.querySelector('[data-book-index="9999"]'));assert.ok(grid.children.length<25);
 const last=grid.querySelector('[data-book-index="9999"]');last.focus();last.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(window.document.activeElement.dataset.bookIndex,'0');
 const first=grid.querySelector('[data-book-index="0"]');first.focus();grid.scrollTop=100;grid.dispatchEvent(new window.Event('scroll'));await wait();assert.equal(window.document.activeElement,first);
 dispose();const html=grid.innerHTML;grid.scrollTop=1400000;grid.dispatchEvent(new window.Event('scroll'));await wait();assert.equal(grid.innerHTML,html);dom.window.close();
});
