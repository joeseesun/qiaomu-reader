for (const trigger of document.querySelectorAll('[data-modal]')) {
  const dialog = document.getElementById(trigger.dataset.modal);
  trigger.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
}
for (const link of document.querySelectorAll('a[href*="community.obsidian.md"],a[href*="qiaomu-reader-dsh/releases"]')) {
  link.addEventListener('click', () => {if(typeof window.umami?.track==='function')window.umami.track('install-click',{edition:link.href.includes('obsidian')?'obsidian':'dsh'});});
}
if('serviceWorker' in navigator) window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});
