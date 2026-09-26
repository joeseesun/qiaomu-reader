import test from 'node:test';
import { setTimeout as defer } from 'node:timers';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { extractEpubContext, EPUB_CONTEXT_LIMITS } from '../src/epub-context.js';
import { bindBookAttachment, droppedVaultBooks } from '../src/ai-book-attachment.js';
import { shouldFollowContext } from '../src/reader-experience.js';
const parserWindow = new JSDOM().window;
const extract = (bytes, options = {}) => extractEpubContext(bytes, { DOMParser: parserWindow.DOMParser, yieldTask: () => new Promise(resolve => defer(resolve, 0)), ...options });
async function epub(chapters = ['<p>第一章，床前明月光。</p>', '<p>第二章，疑是地上霜。</p>'], mutate = () => {}) {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  zip.file('OPS/book.opf', `<package xmlns="http://www.idpf.org/2007/opf"><manifest>${chapters.map((_,i)=>`<item id="c${i}" href="text/ch${i}.xhtml" media-type="application/xhtml+xml"/>`).reverse().join('')}</manifest><spine>${chapters.map((_,i)=>`<itemref idref="c${i}"/>`).join('')}</spine></package>`);
  chapters.forEach((body,i) => zip.file(`OPS/text/ch${i}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`));
  mutate(zip);
  return zip.generateAsync({ type:'arraybuffer', compression:'DEFLATE' });
}
test('extracts every chapter in spine order with paragraph boundaries and no active content', async () => {
  const result = await extract(await epub(['<script>fetch("https://bad.test")</script><p>一</p><p>二</p><style>secret</style>', '<p>三</p><iframe>hidden</iframe>']));
  assert.equal(result.text, '一\n二\n\n三');
  assert.equal(result.chapters, 2); assert.equal(result.truncated, false);
});
test('truncation is explicit, respects character budget, and stops before later chapters', async () => {
  const result = await extract(await epub(['<p>'+ '文'.repeat(80)+'</p>', '<p>不应读到</p>']), { limits:{...EPUB_CONTEXT_LIMITS,chars:50} });
  assert.equal(result.text.length,50); assert.equal(result.truncated,true); assert.equal(result.chapters,1); assert.equal(result.totalChapters,2);
});
test('oversized compressed file, expansion and chapter are rejected, including compressible input', async () => {
  const bytes = await epub(['<p>'+'文'.repeat(5000)+'</p>']);
  for (const limits of [{fileBytes:20},{expandedBytes:200},{entryBytes:600},{entries:2},{chapters:0}]) {
    await assert.rejects(extract(bytes,{limits:{...EPUB_CONTEXT_LIMITS,...limits}}), { code:'epub-attachment-too-large' });
  }
});
test('image-only, malformed and missing-spine-chapter EPUBs fail instead of attaching a path', async () => {
  await assert.rejects(extract(await epub(['<img src="a.png"/>'])), {code:'epub-attachment-empty'});
  await assert.rejects(extract(await epub(undefined,z=>z.remove('OPS/text/ch1.xhtml'))), {code:'epub-attachment-invalid'});
  await assert.rejects(extract(await epub(undefined,z=>z.file('OPS/book.opf','<bad>'))), {code:'epub-attachment-invalid'});
  await assert.rejects(extract(new Uint8Array([1,2,3]).buffer));
});
test('EPUB cannot fetch an external spine resource or escape the archive', async () => {
  for (const href of ['https://example.com/a','../../escape.xhtml']) {
    const bytes=await epub(undefined,z=>z.file('OPS/book.opf',`<package><manifest><item id="c" href="${href}" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`));
    await assert.rejects(extract(bytes), {code:'epub-attachment-invalid'});
  }
});
test('cancellation interrupts extraction between chapters', async () => {
  const controller=new AbortController();
  const pending=extract(await epub(Array.from({length:20},()=>'<p>正文</p>')), {signal:controller.signal});
  defer(()=>controller.abort(),0);
  await assert.rejects(pending,{name:'AbortError'});
});
function harness({ read, extraction } = {}) {
  const window = new JSDOM('<main></main>').window;
  const host = window.document.querySelector('main');
  const file = {path:'Books/唐诗三百首.epub',basename:'唐诗三百首',extension:'epub',stat:{size:100}};
  let reads=0, busy=false, current=true, loading=false;
  const ready=[], errors=[];
  const app={vault:{getName:()=> 'vault',getAbstractFileByPath:path=>path===file.path?file:null,readBinary:async()=>{reads++;return read?read():new ArrayBuffer(10);}}};
  const control=bindBookAttachment({host, app, extract:extraction|| (async()=>({text:'正文',truncated:false})),isCurrent:()=>current,isBusy:()=>busy,onLoading:v=>loading=v,onReady:(...args)=>ready.push(args),onError:e=>errors.push(e)});
  return {window,host,file,app,control,ready,errors,get reads(){return reads;}, get loading(){return loading;},setCurrent:v=>current=v,setBusy:v=>busy=v};
}
test('native tree, wiki link and Obsidian URI resolve to actual vault EPUB files only',()=>{
  const h=harness(); const transfer=value=>({getData:()=>value});
  for(const value of ['[[Books/唐诗三百首.epub]]','![[Books/唐诗三百首.epub|唐诗]]', 'Books/唐诗三百首.epub','obsidian://open?vault=vault&file=Books%2F%E5%94%90%E8%AF%97%E4%B8%89%E7%99%BE%E9%A6%96.epub']) assert.deepEqual(droppedVaultBooks(h.app,transfer(value)),[h.file]);
  assert.deepEqual(droppedVaultBooks(h.app,transfer('obsidian://open?vault=other&file=Books/唐诗三百首.epub')),[]);
  h.app.dragManager={draggable:{type:'file',file:h.file}};
  assert.deepEqual(droppedVaultBooks(h.app,transfer('')), [h.file]);
  h.control.dispose(); h.window.close();
});
test('drop consumes file payload, extracts locally, and leaves composer text unchanged',async()=>{
  const h=harness();const input=h.host.appendChild(h.window.document.createElement('textarea'));input.value='尚未发送的问题';
  const event=new h.window.Event('drop',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'dataTransfer',{value:{getData:type=>type==='text/plain'?'[[Books/唐诗三百首.epub]]':''}});
  input.dispatchEvent(event); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(event.defaultPrevented,true);assert.equal(input.value,'尚未发送的问题');assert.equal(h.reads,1);assert.equal(h.ready[0][1].text,'正文');assert.equal(h.loading,false);
  h.control.dispose();h.window.close();
});
test('removal, close, newer drop and book switch never attach an obsolete asynchronous result',async()=>{
  for (const action of ['cancel','dispose','switch','replace']) {
    const resolvers=[];const h=harness({read:()=>new Promise(resolve=>resolvers.push(resolve))});
    const pending=h.control.attach(h.file);
    assert.equal(h.loading,true);
    let replacement;
    if(action==='switch') h.setCurrent(false);
    else if(action==='replace') replacement=h.control.attach(h.file);
    else h.control[action]();
    resolvers[0](new ArrayBuffer(10));await pending;
    assert.equal(h.ready.length,0,action);
    if(replacement){resolvers[1](new ArrayBuffer(10));await replacement;assert.equal(h.ready.length,1);}
    h.control.dispose();h.window.close();
  }
});
test('read/extraction errors, oversized file and busy state do not leave loading stuck',async()=>{
  for(const opts of [{read:()=>{throw new Error('read failed');}},{extraction:async()=>{throw new Error('bad epub');}}]){
    const h=harness(opts);await h.control.attach(h.file);assert.equal(h.loading,false);assert.equal(h.errors[0],'epub-attachment-invalid');h.control.dispose();h.window.close();
  }
  const h=harness();h.file.stat.size=EPUB_CONTEXT_LIMITS.fileBytes+1;await h.control.attach(h.file);assert.equal(h.reads,0);assert.equal(h.errors[0],'epub-attachment-too-large');
  h.setBusy(true);await h.control.attach(h.file);assert.equal(h.reads,0);h.control.dispose();h.window.close();
});
test('whole book attachment survives page following but changes when another book is opened',()=>{
  assert.equal(shouldFollowContext('attachment',true),false);
  assert.equal(shouldFollowContext('attachment',false),true);
});

test('actual cumulative decompression is bounded even when directory sizes lie and chapters contain no text', async () => {
  const bytes = await epub(Array.from({length:6},()=>'<script>'+'x'.repeat(500)+'</script>'));
  const view = new DataView(bytes);
  for(let offset=0;offset<bytes.byteLength-46;offset++){
    if(view.getUint32(offset,true)===0x02014b50) view.setUint32(offset+24,1,true);
  }
  await assert.rejects(extract(bytes,{limits:{...EPUB_CONTEXT_LIMITS,expandedBytes:2500,entryBytes:2000}}), {code:'epub-attachment-too-large'});
});
