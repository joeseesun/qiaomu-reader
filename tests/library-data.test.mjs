import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryTarget, sortLibrary, cleanBookName, findDuplicateBook } from '../src/library-data.js';
test('download folder is fixed and explicit user paths win',()=>{
 assert.equal(libraryTarget({}), 'Books');assert.equal(libraryTarget({booksFolder:'Library'}),'Library');assert.equal(libraryTarget({booksFolder:'Library',downloadFolder:'Inbox'}),'Inbox');
});
test('recent additions and Chinese pinyin ordering are independent of reading history',()=>{
 const f=(name,ctime)=>({basename:name,path:name+'.epub',stat:{ctime}});
 assert.deepEqual(sortLibrary([f('重庆',1),f('北京',2),f('上海',3)],'title','zh-CN',()=>null).map(x=>x.basename),['北京','重庆','上海']);
 assert.equal(sortLibrary([f('旧书',1),f('新书',2)],'added','zh',()=>({lastRead:999}),{} )[0].basename,'新书');
 assert.equal(sortLibrary([f('旧书',1),f('新书',2)],'added','zh',()=>null,{'旧书.epub':{addedAt:3}})[0].basename,'旧书');
});
test('metadata naming removes source suffixes and is safe on Windows',()=>{
 assert.equal(cleanBookName('三体 (Z-Library).epub'),'三体.epub');assert.equal(cleanBookName('鲁迅全集_鲁迅_z_library_sk_1lib_sk_z_lib_sk.epub'),'鲁迅全集_鲁迅.epub');assert.equal(cleanBookName('x.epub',{title:'三体',author:'刘慈欣'}),'三体 - 刘慈欣.epub');assert.equal(cleanBookName('CON.txt'),'_CON.txt');assert.equal(cleanBookName('x.epub',{title:'A/B:C'}),'A_B_C.epub');
});
test('identical bytes deduplicate but different editions with the same name do not',async()=>{
 const bytes=new Uint8Array([1,2,3]).buffer, file={path:'old.epub',stat:{size:3,mtime:2}},records={};let reads=0;
 const read=async()=>{reads++;return bytes;};
 assert.equal((await findDuplicateBook(bytes,[file],records,read)).duplicate,file);
 assert.equal((await findDuplicateBook(bytes,[file],records,read)).duplicate,file);assert.equal(reads,1);
 assert.equal((await findDuplicateBook(new Uint8Array([3,2,1]).buffer,[file],records,read)).duplicate,null);
 file.stat.mtime=3;await findDuplicateBook(bytes,[file],records,read);assert.equal(reads,2);
});
