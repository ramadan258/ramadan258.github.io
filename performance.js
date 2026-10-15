(() => {
  const marks = new Map();
  const results = [];
  const clock = () => performance.now();
  let enabled=false;
  try{const query=new URL(location.href).searchParams;if(query.has('performance'))sessionStorage.setItem('wa3i-performance-review',query.get('performance')==='0'?'0':'1');enabled=sessionStorage.getItem('wa3i-performance-review')==='1';}catch{}
  function publish() {
    if (!enabled || !document.body) return;
    let panel = document.getElementById('performanceReview');
    if (!panel) {
      panel = document.createElement('details'); panel.id = 'performanceReview';
      panel.style.cssText = 'position:fixed;bottom:4px;left:4px;z-index:100001;background:#10232b;color:white;max-height:40vh;overflow:auto;font:12px monospace;direction:ltr';
      panel.innerHTML = '<summary>Performance (ms)</summary><pre></pre>'; document.body.append(panel);
    }
    panel.querySelector('pre').textContent = JSON.stringify({phases: results, resources: performance.getEntriesByType('resource').map(r => ({
      name: new URL(r.name).pathname, ms: Math.round(r.duration), transferred: r.transferSize
    }))}, null, 2);
  }
  window.WA3I_PERFORMANCE = Object.freeze({
    start(name) { marks.set(name, clock()); performance.mark('wa3i:' + name + ':start'); },
    end(name) { if (!marks.has(name)) return; const ms = Math.round((clock() - marks.get(name)) * 10) / 10;
      results.push({name, kind:'duration',ms}); marks.delete(name); performance.mark('wa3i:' + name + ':end'); publish(); },
    duration(name,ms) {results.push({name,kind:'duration',ms:Math.round(ms*10)/10});publish();},
    mark(name) { results.push({name, kind:'milestone',ms: Math.round(clock())}); performance.mark('wa3i:' + name); publish(); }
  });
  window.WA3I_PERFORMANCE.mark('document-start');
  if(enabled)document.addEventListener('click',event=>{
    const control=event.target.closest?.('[data-tab],#previousQuestion,#nextQuestion');if(!control)return;
    const name=control.hasAttribute('data-tab')?'tab-paint':'report-step-paint';
    const start=clock();requestAnimationFrame(()=>requestAnimationFrame(()=>window.WA3I_PERFORMANCE.duration(name,clock()-start)));
  },true);
  document.addEventListener('DOMContentLoaded', publish, {once: true});
})();
