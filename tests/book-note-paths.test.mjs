import { noteFolderPath, ensureNoteFolder, migrateNoteFolderDefaults } from '../src/note-folders.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
class TFile {
  constructor(path) { this.path = path; this.basename = path.split('/').at(-1).replace(/\.md$/, ''); this.extension = 'md'; }
}
function setup(paths) {
  const files = paths.map(p => new TFile(p));
  const app = { vault: { getAbstractFileByPath: path => files.find(f => f.path === path), getMarkdownFiles: () => files }, metadataCache: { getFirstLinkpathDest: () => files[0] } };
  const start = source.indexOf('function resolveBookNote(app, name) {');
  const code = source.slice(start, source.indexOf('\nconst BookNotePicker', start));
  const resolve = vm.runInNewContext(`${code}; resolveBookNote`, { TFile, noteFolderPath, qiaomuReaderPath: p => p });
  return { app, files, resolve };
}
test('full reading-note paths disambiguate same-name notes and never redirect deleted targets', () => {
  const { app, files, resolve } = setup(['A/笔记.md', 'B/笔记.md']);
  assert.equal(resolve(app, 'A/笔记.md'), files[0]);
  assert.equal(resolve(app, 'B/笔记.md'), files[1]);
  assert.equal(resolve(app, 'Missing/笔记.md'), null);
  assert.equal(resolve(app, '笔记'), null);
});
test('unambiguous legacy reading-note links remain readable', () => {
  const { app, files, resolve } = setup(['A/笔记.md']);
  assert.equal(resolve(app, '笔记'), files[0]);
});
test('creating same-name notes in separate folders avoids all existing ordinary notes', async () => {
  const { app, files } = setup(['A/笔记.md', 'B/笔记.md']);
  const start = source.indexOf('  async createBookNote(file, title, folder) {');
  const code = source.slice(start, source.indexOf('  async _materializeBookNote(', start));
  const writes = [];
  const create = vm.runInNewContext(`({${code}}).createBookNote`, { TFile, noteFolderPath, qiaomuReaderPath: p => p, sanitizeNoteTitle: p => p, writeBookProperty: async (app, path, book) => writes.push([path, book.path]) });
  const plugin = { app, settings: {}, saveAll: async () => {}, _materializeBookNote: async path => { const file=new TFile(path); files.push(file); return file; } };
  await create.call(plugin, { path: 'a.epub' }, '笔记', 'A');
  await create.call(plugin, { path: 'b.epub' }, '笔记', 'B');
  assert.equal(plugin.settings.bookNoteLinks['a.epub'], 'A/笔记 (2).md');
  assert.equal(plugin.settings.bookNoteLinks['b.epub'], 'B/笔记 (2).md');
  assert.deepEqual(writes, [['A/笔记 (2).md','a.epub'],['B/笔记 (2).md','b.epub']]);
  assert.equal(files[0].path,'A/笔记.md');
  assert.equal(files[1].path,'B/笔记.md');
});
test('renaming a note or its folder updates exact links without touching similarly named paths', () => {
  const start = source.indexOf('  _watchBookFiles() {');
  const code = source.slice(start, source.indexOf('  _scheduleFirstRunFlow()', start));
  const callbacks = {};
  let saves = 0;
  const watch = vm.runInNewContext(`({${code}})._watchBookFiles`, { window: {}, BOOK_EXTENSIONS: new Set() });
  const plugin = { settings: { bookNoteLinks: { a: 'A/笔记.md', b: 'AB/笔记.md', c: 'B/笔记.md' } }, app: { vault: { on: (name, fn) => { (callbacks[name] ||= []).push(fn); } } }, registerEvent() {}, registerBookCommands() {}, _saveLocalData: () => saves++ };
  watch.call(plugin);
  callbacks.rename[0]({ path: '移动后' }, 'A');
  assert.equal(plugin.settings.bookNoteLinks.a, '移动后/笔记.md');
  assert.equal(plugin.settings.bookNoteLinks.b, 'AB/笔记.md');
  callbacks.rename[0]({ path: 'B/新名字.md' }, 'B/笔记.md');
  assert.equal(plugin.settings.bookNoteLinks.c, 'B/新名字.md');
  assert.equal(saves, 2);
});
test('two books requesting the same note filename receive separate notes', async () => {
  const { app, files } = setup(['笔记.md']);
  const start = source.indexOf('  async createBookNote(file, title, folder) {');
  const code = source.slice(start, source.indexOf('  async _materializeBookNote(', start));
  const create = vm.runInNewContext(`({${code}}).createBookNote`, { TFile, noteFolderPath, qiaomuReaderPath: p => p, sanitizeNoteTitle: p => p, writeBookProperty: async () => {} });
  const plugin = { app, settings: { bookNoteLinks: { 'first.epub': '笔记.md' } }, saveAll: async () => {}, _materializeBookNote: async path => { const f = new TFile(path); files.push(f); return f; } };
  const made = await create.call(plugin, { path: 'second.epub' }, '笔记', '');
  assert.equal(made.path, '笔记 (2).md');
  assert.equal(plugin.settings.bookNoteLinks['first.epub'], '笔记.md');
  assert.equal(plugin.settings.bookNoteLinks['second.epub'], made.path);
});

function folderVault() {
  class Folder { constructor(path){this.path=path;} }
  const root=new Folder('/'), entries=new Map(), created=[];
  const vault={getRoot:()=>root,getAbstractFileByPath:path=>entries.get(path),async createFolder(path){
    const parent=path.split('/').slice(0,-1).join('/');
    if(parent&&!entries.has(parent))throw new Error('Missing parent');
    entries.set(path,new Folder(path));created.push(path);
  }};
  return {vault,entries,created,root,isFolder:entry=>entry instanceof Folder};
}
test('explicit root, nonexistent nested folders, concurrent creation and file collisions',async()=>{
  const h=folderVault();
  assert.equal(noteFolderPath('/'),'');assert.equal(noteFolderPath(' /Notes//书籍/ '),'Notes/书籍');
  assert.equal(await ensureNoteFolder(h.vault,'',h.isFolder),h.root);
  const made=await ensureNoteFolder(h.vault,'Notes/书籍/唐诗',h.isFolder);
  assert.equal(made.path,'Notes/书籍/唐诗');assert.deepEqual(h.created,['Notes','Notes/书籍','Notes/书籍/唐诗']);
  await Promise.all([ensureNoteFolder(h.vault,'同时/创建',h.isFolder),ensureNoteFolder(h.vault,'同时/创建',h.isFolder)]);
  h.entries.set('blocked',new TFile('blocked'));
  await assert.rejects(ensureNoteFolder(h.vault,'blocked/notes',h.isFolder));
  for(const path of ['../escape','Notes/../other','C:/absolute'])assert.throws(()=>noteFolderPath(path));
});
test('root override is not replaced by defaults, and folder failure never silently falls back to root',async()=>{
  const h=folderVault();
  const start=source.indexOf('function inboxNotePath('),end=source.indexOf('function bookNoteFiles(',start);
  const functions=vm.runInNewContext(`${source.slice(start,end)};({inboxNotePath,resolveNotesFolder})`,{noteFolderPath,ensureNoteFolder,notesFolderPath:()=> 'Default',qiaomuReaderPath:p=>p,TFolder:class{}});
  const app={vault:h.vault};
  assert.equal(functions.inboxNotePath(app,'New',''),'New.md');
  assert.equal(functions.inboxNotePath(app,'New',undefined),'Default/New.md');
  assert.equal(await functions.resolveNotesFolder(app,''),h.root);
  h.vault.createFolder=async()=>{throw new Error('Permission denied');};
  await assert.rejects(functions.resolveNotesFolder(app,'Missing'),/Permission denied/);
});

test('explicit creation avoids linked notes too and skips all numbered collisions', async () => {
  const {app,files}=setup(['唐诗.md','唐诗 (2).md','唐诗 (3).md']);const properties=[];
  const start=source.indexOf('  async createBookNote(file, title, folder) {');
  const code=source.slice(start,source.indexOf('  async _materializeBookNote(',start));
  const create=vm.runInNewContext(`({${code}}).createBookNote`,{TFile,noteFolderPath,qiaomuReaderPath:p=>p,sanitizeNoteTitle:p=>p,writeBookProperty:async(_app,path)=>properties.push(path)});
  const plugin={app,settings:{bookNoteLinks:{'唐诗.epub':'唐诗.md'}},saveAll:async()=>{},_materializeBookNote:async path=>{const note=new TFile(path);files.push(note);return note;}};
  const note=await create.call(plugin,{path:'唐诗.epub'},'唐诗','');
  assert.equal(note.path,'唐诗 (4).md');assert.deepEqual(properties,['唐诗 (4).md']);
});

function setupPrompt(saveAll) {
  const opened=[];
  class Modal { constructor(){this.contentEl={empty(){}};} open(){opened.push(this);} close(){this.onClose();} }
  const start=source.indexOf('function promptForBookNote('), end=source.indexOf('const OnboardingModal',start);
  const prompt=vm.runInNewContext(`${source.slice(start,end)};promptForBookNote`,{Modal,Notice:class{},qiaomuReaderTranslate:key=>key});
  const plugin={settings:{},saveAll};
  const pending=prompt({},plugin,{path:'book.epub'});
  return {pending,modal:opened[0],plugin};
}
test('failed BookSetupModal finish settles the prompt and releases a queued translation save', async () => {
  const h=setupPrompt(async()=>{throw new Error('disk full');});
  h.modal.createdNote={path:'made.md'};
  let next=false;
  const queued=h.pending.then(()=>{next=true;});
  await h.modal._finish('created');await queued;
  assert.equal(await h.pending,null);assert.equal(next,true);assert.equal(h.modal._closed,true);
  h.modal.close();
});
test('closing during a pending finish resolves cancellation immediately and a late save cannot resolve twice', async () => {
  let finish;const h=setupPrompt(()=>new Promise(resolve=>finish=resolve));
  let completions=0;h.pending.then(()=>completions++);
  h.modal.createdNote={path:'made.md'};
  const saving=h.modal._finish('created');h.modal.close();
  assert.equal(await h.pending,null);finish();await saving;
  assert.equal(completions,1);
});
test('successful BookSetupModal finish returns the created file exactly once', async () => {
  const h=setupPrompt(async()=>{});const note={path:'made.md'};h.modal.createdNote=note;
  await h.modal._finish('created');assert.equal(await h.pending,note);
  h.modal.close();assert.equal(await h.pending,note);
});

for (const failure of ['saveAll','writeBookProperty']) test(`created note remains a successful concrete result when ${failure} fails, so callers cannot retry creation`,async()=>{
  const {app,files}=setup([]);let creations=0;const notices=[];
  const start=source.indexOf('  async createBookNote(file, title, folder) {');
  const code=source.slice(start,source.indexOf('  async _materializeBookNote(',start));
  const create=vm.runInNewContext(`({${code}}).createBookNote`,{TFile,noteFolderPath,qiaomuReaderPath:p=>p,sanitizeNoteTitle:p=>p,
    console:{error(){}},Notice:class{constructor(text){notices.push(text);}},qiaomuReaderTranslate:(key,...args)=>[key,...args].join(' '),
    writeBookProperty:async()=>{if(failure==='writeBookProperty')throw new Error('Frontmatter write failed');}});
  const plugin={app,settings:{},saveAll:async()=>{if(failure==='saveAll')throw new Error('Disk full');},_materializeBookNote:async path=>{creations++;const note=new TFile(path);files.push(note);return note;}};
  const note=await create.call(plugin,{path:'book.epub'},'普通笔记','');
  assert.ok(note instanceof TFile);assert.equal(note.path,'普通笔记.md');assert.equal(plugin.settings.bookNoteLinks['book.epub'],note.path);
  assert.equal(creations,1);assert.equal(files.length,1);assert.match(notices[0],/book-note-created-0/);assert.match(notices[0],/could-not-save/);
});

test('legacy empty book and last-note folders inherit the custom excerpt folder once', () => {
  const settings={notesFolder:'Custom/书籍',bookNotesFolder:'',lastNoteFolder:'',bookNoteLinks:{book:'Original/已存在.md'}};
  assert.equal(migrateNoteFolderDefaults(settings),true);
  assert.equal(settings.bookNotesFolder,'Custom/书籍');assert.equal(settings.lastNoteFolder,'Custom/书籍');
  assert.equal(settings.bookNoteLinks.book,'Original/已存在.md');
  const reloaded=JSON.parse(JSON.stringify(settings));reloaded.bookNotesFolder='';reloaded.lastNoteFolder='';
  assert.equal(migrateNoteFolderDefaults(reloaded),false);
  assert.equal(reloaded.bookNotesFolder,'');assert.equal(reloaded.lastNoteFolder,'');
});
test('migration preserves custom per-book paths, existing note overrides and root defaults', () => {
  for(const settings of [{notesFolder:'Custom',bookNotesFolder:'Books',lastNoteFolder:'Excerpt'}, {notesFolder:'',bookNotesFolder:'',lastNoteFolder:''}]){
    const expected={...settings};migrateNoteFolderDefaults(settings);
    for(const key of ['notesFolder','bookNotesFolder','lastNoteFolder'])assert.equal(settings[key],expected[key]);
  }
});
test('normal plugin load persists migrated defaults after restoring backup state and only once',async()=>{
  let saved={settings:{notesFolder:'Custom',bookNotesFolder:''},progressBackups:{book:['keep']}};let saves=0,restored=false;
  const start=source.indexOf('  async loadAll() {'),end=source.indexOf('  _mergeDefaultSettings(',start);
  const load=vm.runInNewContext(`({${source.slice(start,end)}}).loadAll`,{migrateNoteFolderDefaults,applyDeviceProfile(){}});
  const plugin={loadData:async()=>saved,_mergeDefaultSettings(data){this.settings={...data.settings};},_applyLegacySettingMigrations:async()=>{},_applyLanguageDefaults(){},_migrateChineseDefaults:async()=>{},
    async _restoreReadingState(data){this.progressBackups=data.progressBackups;restored=true;},async _saveLocalData(){assert.equal(restored,true);saves++;saved=JSON.parse(JSON.stringify({settings:this.settings,progressBackups:this.progressBackups}));},_repairBookNoteState:async()=>{},_adoptLegacyProgress:async()=>{}};
  await load.call(plugin);assert.equal(saved.settings.bookNotesFolder,'Custom');assert.deepEqual(saved.progressBackups,{book:['keep']});assert.equal(saves,1);
  saved.settings.bookNotesFolder='';saved.settings.lastNoteFolder='';
  await load.call(plugin);assert.equal(plugin.settings.bookNotesFolder,'');assert.equal(saves,1);
});
