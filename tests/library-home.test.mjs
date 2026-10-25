import test from 'node:test';import assert from 'node:assert/strict';
import {createHomeProvider} from '../src/home.js';
test('Home recovers per-file thumbnails after restart without reading book bytes',async()=>{
 const file={path:'Books/one.epub',basename:'one',extension:'epub'};let reads=0,notices=0;
 const plugin={manifest:{id:'qiaomu-reader'},app:{workspace:{trigger:()=>notices++}},thumbCache:{},bookFiles:()=>[file],getProgress:()=>({lastRead:1,percent:30}),_thumbStore:{get:async()=>{reads++;return 'app://vault/thumbs/one.jpg';}}};
 const home=createHomeProvider(plugin,x=>x);assert.equal(home.sections()[0].items[0].image,undefined);home.sections();
 await new Promise(r=>setImmediate(r));assert.equal(home.sections()[0].items[0].image,'app://vault/thumbs/one.jpg');assert.equal(reads,1);assert.equal(notices,1);
});
test('Home does not announce a delayed thumbnail after plugin unload',async()=>{
 const file={path:'book.epub',basename:'book',extension:'epub'};let finish,notices=0;
 const plugin={manifest:{id:'qiaomu-reader'},app:{workspace:{trigger:()=>notices++}},bookFiles:()=>[file],getProgress:()=>({lastRead:1}),_thumbStore:{get:()=>new Promise(r=>{finish=r;})}};
 createHomeProvider(plugin,x=>x).sections();plugin._unloading=true;finish('app://cover');await new Promise(r=>setImmediate(r));assert.equal(notices,0);assert.equal(plugin.thumbCache,undefined);
});
