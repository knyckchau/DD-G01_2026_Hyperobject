// Scroll arrows instead of scrollbars for the side panels and the tab strip (shared by index.html and ls.html).
// The scrollbar is hidden; an arrow strip appears at the edge that has more content. Hovering scrolls slowly,
// clicking jumps most of a page, and the mouse wheel / trackpad still work as usual.
(function () {
  const css = `
.hs{scrollbar-width:none}.hs::-webkit-scrollbar{display:none}
.hs-a{position:absolute;z-index:20;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s;color:var(--mute,#6b7078);font-size:11px;user-select:none}
.hs-a.on{opacity:1;pointer-events:auto}
.hs-a.y{height:26px}.hs-a.x{width:26px}
.hs-a.top{background:linear-gradient(var(--panel,#fff) 35%,rgba(255,255,255,0))}
.hs-a.bot{background:linear-gradient(rgba(255,255,255,0),var(--panel,#fff) 65%)}
.hs-a.lft{background:linear-gradient(90deg,var(--panel,#fff) 45%,rgba(255,255,255,0))}
.hs-a.rgt{background:linear-gradient(90deg,rgba(255,255,255,0),var(--panel,#fff) 55%)}
.hs-a span{display:inline-flex;width:22px;height:16px;align-items:center;justify-content:center;border-radius:8px;transition:background .15s,color .15s}
.hs-a:hover span{background:var(--ink,#1d1f22);color:#fff}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const SPEED = 240; // px per second while hovering
  function attach(el, axis) {
    if (!el || el.dataset.hs) return; el.dataset.hs = 1; el.classList.add('hs');
    const host = el.offsetParent || el.parentElement;
    const mk = (cls, ch, dir) => { const a = document.createElement('div'); a.className = `hs-a ${axis} ${cls}`; a.innerHTML = `<span>${ch}</span>`; host.appendChild(a); a._d = dir; return a; };
    const A = axis === 'y' ? [mk('top', '▲', -1), mk('bot', '▼', 1)] : [mk('lft', '◀', -1), mk('rgt', '▶', 1)];
    let raf = 0, last = 0, dirNow = 0;
    const step = t => { if (!dirNow) return; const dt = last ? (t - last) / 1000 : 0; last = t; if (axis === 'y') el.scrollTop += dirNow * SPEED * dt; else el.scrollLeft += dirNow * SPEED * dt; update(); raf = requestAnimationFrame(step); };
    A.forEach(a => {
      a.addEventListener('mouseenter', () => { dirNow = a._d; last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(step); });
      a.addEventListener('mouseleave', () => { dirNow = 0; cancelAnimationFrame(raf); });
      a.addEventListener('click', () => { const v = axis === 'y' ? el.clientHeight : el.clientWidth; el.scrollBy({ [axis === 'y' ? 'top' : 'left']: a._d * v * 0.8, behavior: 'smooth' }); });
    });
    function update() {
      const r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
      const x = r.left - h.left + host.scrollLeft, y = r.top - h.top + host.scrollTop;
      if (axis === 'y') {
        const [t, b] = A;
        Object.assign(t.style, { left: x + 'px', top: y + 'px', width: r.width + 'px' });
        Object.assign(b.style, { left: x + 'px', top: (y + r.height - 26) + 'px', width: r.width + 'px' });
        t.classList.toggle('on', el.scrollTop > 2); b.classList.toggle('on', el.scrollTop + el.clientHeight < el.scrollHeight - 2);
      } else {
        const [l, g] = A;
        Object.assign(l.style, { left: x + 'px', top: y + 'px', height: r.height + 'px' });
        Object.assign(g.style, { left: (x + r.width - 26) + 'px', top: y + 'px', height: r.height + 'px' });
        l.classList.toggle('on', el.scrollLeft > 2); g.classList.toggle('on', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
      }
      if (!(A[0].classList.contains('on') || A[1].classList.contains('on'))) { dirNow = 0; }
    }
    el.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    new ResizeObserver(update).observe(el);
    new MutationObserver(() => requestAnimationFrame(update)).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
    update(); setTimeout(update, 300); setTimeout(update, 1500);
  }
  function init() {
    attach(document.querySelector('main > aside:not(.r)'), 'y');
    attach(document.getElementById('pane'), 'y');
    attach(document.getElementById('tabs'), 'x');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
