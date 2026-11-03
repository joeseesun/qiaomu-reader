import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);const id=readFileSync(new URL('umami-id.txt',root),'utf8').trim();
const live=process.argv.includes('--live');
const html=live?await fetch('https://reader.qiaomu.ai/').then(r=>{assert.equal(r.status,200);return r.text()}):readFileSync(new URL('dist/index.html',root),'utf8');
assert.equal((html.match(/data-website-id=/g)||[]).length,1);
assert.ok(html.includes(`data-website-id="${id}"`));assert.ok(html.includes('data-domains="reader.qiaomu.ai"'));
assert.ok(!/UMAMI_ID|BUILD/.test(html));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'duplicate ID');
for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(match[1]),'broken anchor '+match[1]);
const assets=[...new Set([...html.matchAll(/(?:src|href)="(\/[^"#?]*)(?:\?[^"#]*)?"/g)].map(m=>m[1]).filter(p=>p!=='/'))];
for(const asset of assets){if(live){const r=await fetch('https://reader.qiaomu.ai'+asset);assert.equal(r.status,200,asset)}else assert.ok(existsSync(fileURLToPath(new URL('dist'+asset,root))),asset)}
assert.ok(html.includes('https://community.obsidian.md/plugins/qiaomu-reader'));
assert.ok(html.includes('https://github.com/joeseesun/qiaomu-reader-dsh/releases/latest'));
console.log(JSON.stringify({ok:true,live,assets:assets.length,anchors:ids.length,websiteId:id,eventIngestionVerified:false}));
