export function libraryWindow(total, columns, rowHeight, top, height, overscan = 2) {
  const rows = Math.ceil(total / columns);
  const first = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, top) / rowHeight)) - overscan);
  const end = Math.min(rows, first + Math.ceil(height / rowHeight) + overscan * 2 + 1);
  return { start: first * columns, end: Math.min(total, end * columns), before: first * rowHeight, after: Math.max(0, (rows - end) * rowHeight) };
}
export function mountLibraryWindow(grid, files, render) {
  const view = grid.ownerDocument.defaultView;
  const scroll = grid;
  grid.classList.add('qiaomu-reader-lib-virtual');
  let stopped = false, frame = 0, previous = '', rowHeight = 360, columns = 1, slice;
  const paint = () => {
    frame = 0; if (stopped || !grid.isConnected) return;
    const style = view.getComputedStyle(grid); columns = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
    const gap = parseFloat(style.rowGap) || 0;
    slice = libraryWindow(files.length, columns, rowHeight, scroll.scrollTop, scroll.clientHeight || view.innerHeight);
    const key = `${slice.start}:${slice.end}:${columns}:${rowHeight}`;
    if (key === previous) return; previous = key;
    const active = grid.ownerDocument.activeElement;
    const retained = new Map([...grid.querySelectorAll('.qiaomu-reader-lib-card')].map(card => [Number(card.dataset.bookIndex), card]));
    grid.replaceChildren();
    const spacer = height => { if (height <= 0) return; const el = grid.ownerDocument.createElement('div');el.className = 'qiaomu-reader-lib-spacer';el.setCssProps({'--qbr-spacer-height':Math.max(0,height-gap)+'px'});grid.append(el); };
    spacer(slice.before);
    for (let i=slice.start;i<slice.end;i++) {
      if (retained.has(i)) grid.append(retained.get(i));
      else {render(grid,files[i]);grid.lastElementChild.dataset.bookIndex=String(i);}
    }
    spacer(slice.after);
    if (active && grid.contains(active)) active.focus({preventScroll:true});
    const card = grid.querySelector('.qiaomu-reader-lib-card');
    const measured = card?.getBoundingClientRect().height + gap;
    if (measured > 0 && Math.abs(measured-rowHeight) > 1) {rowHeight=measured;queue();}
  };
  const queue = () => { if (!frame && !stopped) frame=view.requestAnimationFrame(paint); };
  const keydown = event => {
    const card = event.target.closest('.qiaomu-reader-lib-card'); if (!card || !slice) return;
    const index=Number(card.dataset.bookIndex);let next;
    if (event.target === card) next = ({ArrowRight:index+1,ArrowLeft:index-1,ArrowDown:index+columns,ArrowUp:index-columns,Home:0,End:files.length-1})[event.key];
    if (event.key === 'Tab') {
      const controls=card.querySelectorAll('button');
      if (!event.shiftKey && event.target===controls[controls.length-1] && index===slice.end-1 && index<files.length-1) next=index+1;
      if (event.shiftKey && event.target===card && index===slice.start && index>0) next=index-1;
    }
    if (next===undefined || next<0 || next>=files.length) return;
    event.preventDefault();
    scroll.scrollTop = Math.floor(next/columns)*rowHeight;
    paint();
    const target=grid.querySelector(`[data-book-index="${next}"]`);
    const controls=target?.querySelectorAll('button');
    (event.key==='Tab' && event.shiftKey ? controls?.[controls.length-1] : target)?.focus({preventScroll:true});
  };
  const resize = new view.ResizeObserver(()=>{previous='';queue();});resize.observe(grid);
  scroll.addEventListener('scroll',queue,{passive:true});grid.addEventListener('keydown',keydown);paint();
  return () => {stopped=true;view.cancelAnimationFrame(frame);resize.disconnect();scroll.removeEventListener('scroll',queue);grid.removeEventListener('keydown',keydown);grid.classList.remove('qiaomu-reader-lib-virtual');};
}
