import test from 'node:test';
import assert from 'node:assert/strict';
import { bookMetadata, bookMatches, canonicalIsbn, matchBook, vaultCatalog } from '../src/book-catalog.js';
import { createBookRecords } from '../src/book-records.js';

const digest = 'a'.repeat(64), job = 'b'.repeat(32);
test('bibliography keeps supported fields and excludes device identity, credentials and temporary search IDs', () => {
 const data = bookMetadata({ title: '三体', authors: [{name:'刘慈欣'}], year: 2008, language: ['zh'], isbn:'9787536692930', publisher:'重庆出版社', id:'ephemeral', accessToken:'secret', source:'qiaomu' });
 assert.deepEqual(data,{title:'三体',author:'刘慈欣',year:'2008',language:'zh',isbn:'9787536692930',publisher:'重庆出版社',source:'qiaomu'});
 assert.deepEqual(bookMetadata(null),{});
 assert.equal(bookMatches({basename:'file'},data,'刘慈欣'),true);
 assert.equal(bookMatches({basename:'file'},data,'9787536692930'),true);
 assert.equal(bookMatches({basename:'file'},data,'2008'),true);
});
test('valid ISBN-10 and 13 are the same edition; invalid ISBNs and title-only matches cannot prove ownership',()=>{
 assert.equal(canonicalIsbn('0-306-40615-2'),'9780306406157');
 assert.equal(canonicalIsbn('9780306406157'),'9780306406157');
 assert.equal(canonicalIsbn('9780306406158'),'');
 assert.equal(matchBook({isbn:'0306406152'},[{isbn:'9780306406157',path:'book'}]).exact,true);
 assert.equal(matchBook({title:'三体',author:'刘慈欣'},[{title:'三体',author:'刘慈欣',isbn:'9787536692930'}]).exact,false);
 assert.equal(matchBook({title:'三体'},[{title:'三体',author:'刘慈欣'}]),null);
 assert.equal(matchBook({source:'gutenberg',sourceId:'123'},[{source:'gutenberg',sourceId:'123'}]).exact,true);
 assert.equal(matchBook({source:'qiaomu',id:'123'},[{source:'qiaomu',id:'123'}]),null);
});
function fixture(shared = new Map()) {
 const handlers = {}, registrations=[];
 const on = (event, callback) => { (handlers[event] ||= []).push(callback); return callback; };
 const emit = (event, ...args) => { for(const callback of handlers[event] || []) callback(...args); };
 const vault = { on, getMarkdownFiles:()=>[...shared.values()].filter(x=>x.extension==='md'), getAbstractFileByPath:p=>shared.get(p),
  createFolder:async path=>{shared.set(path,{path});},
  create:async(path,body)=>{if(shared.has(path))throw Error('exists'); const file={path,extension:'md',body,stat:{size:body.length,mtime:1}};shared.set(path,file);return file;},
  readBinary:async file=>file.bytes };
 const cache = file => file.body?.startsWith('---\nqiaomu_book: ') ? {frontmatter:{qiaomu_book:JSON.parse(file.body.split('\n')[1].slice(13))}} : {};
 const plugin = {settings:{bookImports:{},calibreImports:{}},registerEvent:x=>registrations.push(x),app:{vault,metadataCache:{on,getFileCache:cache},fileManager:{generateMarkdownLink:file=>`[[${file.path}]]`,processFrontMatter:async(file,fn)=>{const fm=cache(file).frontmatter;fn(fm);file.body=file.body.replace(/^---\nqiaomu_book: .*\n---/,`---\nqiaomu_book: ${JSON.stringify(fm.qiaomu_book)}\n---`);emit('changed',file,file.body,cache(file));}}}, bookFiles:()=>[...shared.values()].filter(x=>x.extension==='epub')};
 return {plugin, shared, emit, cache};
}
test('record survives a second device with empty plugin settings; append preserves user prose and unions completed jobs',async()=>{
 const f=fixture(), file={path:'Books/三体.epub',basename:'三体',extension:'epub',stat:{size:3,mtime:1}};f.shared.set(file.path,file);
 const first=createBookRecords(f.plugin);
 const note=await first.write(file,{title:'三体',author:'刘慈欣',year:2008,language:'zh',sha256:digest,refreshToken:'secret'},[job]);
 assert.equal(first.hasJob(job),true);assert.ok(!note.body.includes('secret'));assert.ok(note.body.includes('刘慈欣'));
 note.body+='\nUser annotation — keep this.\n';
 const g=fixture(f.shared), second=createBookRecords(g.plugin);
 assert.equal(second.hasJob(job),true);assert.equal(g.plugin.settings.bookImports[file.path].year,'2008');
 assert.equal(vaultCatalog(g.plugin)[0].author,'刘慈欣');
 await second.write(file,{sha256:digest,language:'en'},['c'.repeat(32)]);
 assert.equal(second.hasJob(job),true);assert.ok(note.body.endsWith('User annotation — keep this.\n'));
 assert.equal(second.entries().length,1);
 // Real Obsidian event signature includes raw text before parsed metadata.
 const fm=g.cache(note);fm.frontmatter.qiaomu_book.author='另一作者';
 g.emit('changed',note,'raw text',fm);assert.equal(g.plugin.settings.bookImports[file.path].author,'另一作者');
});
test('book rename updates its record; newer record schemas remain untouched',async()=>{
 const f=fixture(), file={path:'Books/Old.epub',extension:'epub',stat:{size:3,mtime:1},bytes:new Uint8Array([1,2,3]).buffer};f.shared.set(file.path,file);
 const actual=await import('../src/library-data.js').then(x=>x.bookDigest(file.bytes));
 const store=createBookRecords(f.plugin),note=await store.write(file,{title:'Book',sha256:actual},[job]);
 const old=file.path;f.shared.delete(old);file.path='Books/New.epub';f.shared.set(file.path,file);f.emit('rename',file,old);await store.drain();
 assert.equal(f.cache(note).frontmatter.qiaomu_book.path,file.path);
 note.body=note.body.replace('"version":1','"version":2');const snapshot=note.body;
 await assert.rejects(store.write(file,{sha256:actual}),/schema/);assert.equal(note.body,snapshot);
});
test('unload prevents queued record writes',async()=>{
 const f=fixture(),store=createBookRecords(f.plugin);f.plugin._unloading=true;
 await assert.rejects(store.write({path:'x',stat:{}},{sha256:digest}),/closed/);assert.equal(f.shared.size,0);
});

test('sync may deliver a record before its book; later arrivals hydrate without rescanning every note',async()=>{
 const f=fixture(),file={path:'Books/Late.epub',extension:'epub',stat:{size:3,mtime:1}};f.shared.set(file.path,file);
 await createBookRecords(f.plugin).write(file,{title:'Late',author:'Author',sha256:digest},[job]);f.shared.delete(file.path);
 const g=fixture(f.shared);let scans=0;const list=g.plugin.app.vault.getMarkdownFiles;g.plugin.app.vault.getMarkdownFiles=()=>{scans++;return list();};
 createBookRecords(g.plugin);g.emit('resolved');g.emit('resolved');g.emit('resolved');assert.equal(scans,2);
 assert.equal(g.plugin.settings.bookImports[file.path],undefined);g.shared.set(file.path,file);g.emit('create',file);
 assert.equal(g.plugin.settings.bookImports[file.path].author,'Author');assert.equal(g.plugin.settings.bookImports[file.path].mtime,undefined);
});
test('moving the records folder keeps its existing record and user text',async()=>{
 const f=fixture(),file={path:'Books/Book.epub',extension:'epub',stat:{size:3,mtime:1}};f.shared.set(file.path,file);
 const store=createBookRecords(f.plugin),note=await store.write(file,{title:'Book',sha256:digest});note.body+='\nPersonal text';
 const old=note.path;f.shared.delete(old);note.path=old.replace('Qiaomu Reader/Book records','Moved records');f.shared.set(note.path,note);
 f.emit('rename',{path:'Moved records'},'Qiaomu Reader/Book records');await store.write(file,{title:'Book',sha256:digest},[job]);
 assert.equal(store.entries().length,1);assert.equal(store.entries()[0].recordPath,note.path);assert.ok(note.body.endsWith('Personal text'));assert.equal(f.shared.has(old),false);
});
