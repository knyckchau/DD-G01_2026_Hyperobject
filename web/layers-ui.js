// Layer list layout shared by the MEP and Life safety pages.
// Every row is laid out in the same columns:  caret | checkbox | legend swatch | name
// Group headings (caret + checkbox) collapse their rows and switch them all at once.
(function () {
  const css = `
.lay .trow{display:flex;align-items:center;gap:0}
.lay .caret{width:16px;flex:none}
.lay .chk{display:flex;align-items:center;gap:6px;margin:3px 0;flex:1;min-width:0}
.lay .chk > input[type=checkbox]{margin:0;width:14px;height:14px;flex:none}
.lay .cbx{width:14px;flex:none}
.lay .lg{width:30px;flex:none;display:inline-flex;align-items:center;justify-content:flex-start;gap:2px}
.lay .lg > *{margin:0 !important}
.lay .nm{flex:1;min-width:0}
.lay .tkids{margin-left:16px}
.lay .lgh{margin-top:8px}
.lay .lgh > .trow .nm{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--mute);font-weight:600}
.lay .lgh > .trow .lg{display:none}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const SW = 'svg, i, .sw, .ln';
  function alignRow(lab) {
    if (lab.dataset.al) return; lab.dataset.al = 1;
    const inp = lab.querySelector(':scope > input[type=checkbox]');
    const sw = [...lab.children].filter(e => e !== inp && e.matches(SW));
    const lg = document.createElement('span'); lg.className = 'lg';
    const nm = document.createElement('span'); nm.className = 'nm';
    [...lab.childNodes].forEach(n => { if (n === inp) return; if (sw.includes(n)) lg.appendChild(n); else nm.appendChild(n); });
    lab.textContent = '';
    if (inp) lab.appendChild(inp); else { const c = document.createElement('span'); c.className = 'cbx'; lab.appendChild(c); }
    lab.append(lg, nm);
    if (!lab.parentElement.classList.contains('trow')) {
      const tr = document.createElement('div'); tr.className = 'trow';
      const c = document.createElement('span'); c.className = 'caret leaf';
      lab.replaceWith(tr); tr.append(c, lab);
    }
  }
  window.alignLayerRows = root => { root.classList.add('lay'); root.querySelectorAll('.chk').forEach(alignRow); };

  const syncs = [];
  window.syncLayerGroups = () => syncs.forEach(f => f());
  // wire a group node: <div class="tnode lgh"><div class="trow">caret + label(input[data-hgrp])</div><div class="tkids">…</div></div>
  window.wireLayerGroup = node => {
    const hc = node.querySelector(':scope > .trow input[data-hgrp]'), kids = node.querySelector(':scope > .tkids');
    const boxes = () => [...kids.querySelectorAll('input[type=checkbox]')].filter(c => !c.disabled);
    const sync = () => { const b = boxes(), n = b.filter(c => c.checked).length; hc.checked = n === b.length && n > 0; hc.indeterminate = n > 0 && n < b.length; };
    hc.addEventListener('change', e => {
      e.stopPropagation();
      const b = boxes(); b.forEach(c => c.checked = hc.checked);
      if (b[0]) b[0].dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
    kids.addEventListener('change', () => requestAnimationFrame(window.syncLayerGroups));
    syncs.push(sync); sync();
  };
  window.groupHead = title => `<div class="trow"><span class="caret open">▶</span><label class="chk" data-al="1"><input type="checkbox" data-hgrp><span class="lg"></span><span class="nm">${title}</span></label></div>`;
  // wrap existing elements into a collapsible group with a heading checkbox
  window.layerGroup = (title, els) => {
    els = els.filter(Boolean); if (!els.length) return;
    const node = document.createElement('div'); node.className = 'tnode lgh';
    node.innerHTML = window.groupHead(title) + '<div class="tkids"></div>';
    els[0].before(node); const kids = node.querySelector('.tkids'); els.forEach(e => kids.appendChild(e));
    window.wireLayerGroup(node);
  };
})();
