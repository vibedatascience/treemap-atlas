export class Treemap {
  constructor(canvas, data, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.colorMode = opts.colorMode || 'category';
    this.grouped = opts.grouped !== false;
    this.tx = 0; this.ty = 0; this.scale = 1;
    this.hovered = null;
    this.palette = ['#E60023','#0a3069','#0d9488','#b45309','#7c3aed','#be185d','#475569','#166534'];
    this.catColor = new Map();
    this.buildTree();
    this.bindEvents();
    this.resize();
  }

  buildTree() {
    const items = this.data.items.filter(d => d.value > 0);
    const cats = [...new Set(items.map(d => d.color_key || ''))].sort();
    const custom = this.data.colors || {};
    cats.forEach((c, i) => this.catColor.set(c, custom[c] || this.palette[i % this.palette.length]));
    if (this.grouped && items.some(d => d.parent)) {
      const groups = new Map();
      for (const it of items) {
        const p = it.parent || 'Other';
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(it);
      }
      this.root = { children: [...groups.entries()].map(([name, ch]) => ({
        name, children: [...ch].sort((a, b) => b.value - a.value), value: ch.reduce((s, d) => s + d.value, 0)
      })).sort((a, b) => b.value - a.value) };
    } else {
      this.root = { children: [...items].sort((a, b) => b.value - a.value) };
    }
    this.root.value = this.root.children.reduce((s, d) => s + d.value, 0);
    const sorted = [...items].sort((a, b) => b.value - a.value);
    this.rank = new Map(sorted.map((d, i) => [d, i + 1]));
    this.total = sorted.reduce((s, d) => s + d.value, 0);
    this.n = sorted.length;
  }

  squarify(nodes, x, y, w, h) {
    if (!nodes.length) return;
    const total = nodes.reduce((s, n) => s + n.value, 0);
    const area = w * h;
    let i = 0;
    while (i < nodes.length) {
      const horiz = w >= h;
      const side = horiz ? h : w;
      let row = [], rowVal = 0, best = Infinity;
      let j = i;
      while (j < nodes.length) {
        const v = nodes[j].value * area / total;
        const testVal = rowVal + v;
        const rowLen = testVal / side;
        let worst = 0;
        for (let k = i; k <= j; k++) {
          const nv = nodes[k].value * area / total;
          const s = nv / rowLen;
          worst = Math.max(worst, Math.max(rowLen / s, s / rowLen));
        }
        if (worst > best) break;
        best = worst; rowVal = testVal; row.push(nodes[j]); j++;
      }
      const rowLen = rowVal / side;
      let off = 0;
      for (const n of row) {
        const nv = n.value * area / total;
        const s = nv / rowLen;
        if (horiz) { n.x = x; n.y = y + off; n.w = rowLen; n.h = s; }
        else { n.x = x + off; n.y = y; n.w = s; n.h = rowLen; }
        off += s;
      }
      if (horiz) { x += rowLen; w -= rowLen; } else { y += rowLen; h -= rowLen; }
      i = j;
    }
  }

  layout() {
    const W = this.canvas.width / devicePixelRatio, H = this.canvas.height / devicePixelRatio;
    const pad = 2, header = 18;
    if (this.root.children[0] && this.root.children[0].children) {
      this.squarify(this.root.children, 0, 0, W, H);
      for (const g of this.root.children) {
        const gx = g.x + pad, gy = g.y + header, gw = Math.max(0, g.w - pad * 2), gh = Math.max(0, g.h - header - pad);
        this.squarify(g.children, gx, gy, gw, gh);
      }
      this.leaves = this.root.children.flatMap(g => g.children);
    } else {
      this.squarify(this.root.children, 0, 0, W, H);
      this.leaves = this.root.children;
    }
  }

  color(node) {
    if (this.colorMode === 'flat') {
      const idx = this.leaves.indexOf(node);
      return `hsl(215, 15%, ${35 + (idx % 7) * 6}%)`;
    }
    return this.catColor.get(node.color_key || '') || '#64748b';
  }

  fmt(v) {
    if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }

  draw() {
    const ctx = this.ctx, dpr = devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    ctx.translate(this.tx, this.ty);
    ctx.scale(this.scale, this.scale);
    const s = this.scale;
    for (const n of this.leaves) {
      ctx.fillStyle = this.color(n);
      ctx.fillRect(n.x, n.y, n.w, n.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 / s;
      ctx.strokeRect(n.x, n.y, n.w, n.h);
      if (n === this.hovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(n.x, n.y, n.w, n.h);
      }
      const pw = n.w * s, ph = n.h * s;
      if (pw > 26 && ph > 14) {
        const maxW = n.w - 8 / s;
        let fs = Math.min(13, Math.max(7, Math.sqrt(pw * ph) / 6.5)) / s;
        ctx.font = `${fs}px ui-monospace, monospace`;
        let tw = ctx.measureText(n.name).width;
        let lines = [n.name];
        if (tw > maxW && n.name.includes(' ') && n.h > fs * 3) {
          const words = n.name.split(' ');
          let best = null;
          for (let k = 1; k < words.length; k++) {
            const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
            const w2 = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
            if (!best || w2 < best.w) best = { w: w2, lines: [a, b] };
          }
          if (best && best.w <= maxW) { lines = best.lines; tw = best.w; }
        }
        if (tw > maxW) {
          fs = Math.max(7 / s, fs * maxW / tw);
          ctx.font = `${fs}px ui-monospace, monospace`;
          tw = Math.max(...lines.map(l => ctx.measureText(l).width));
        }
        const lineH = fs * 1.15;
        const needH = lineH * lines.length + fs * 0.4;
        if (tw <= maxW && fs * s >= 6.5 && n.h > needH) {
          ctx.fillStyle = '#ffffff';
          lines.forEach((l, li) => ctx.fillText(l, n.x + 4 / s, n.y + fs + 3 / s + li * lineH));
          if (n.h > needH + fs * 1.3 && ph > 30) {
            ctx.font = `${fs * 0.82}px ui-monospace, monospace`;
            ctx.fillText(this.fmt(n.value), n.x + 4 / s, n.y + fs + 3 / s + lines.length * lineH);
          }
        }
      }
    }
    if (this.root.children[0] && this.root.children[0].children) {
      for (const g of this.root.children) {
        const ph = g.h * s, pw = g.w * s;
        if (pw > 60 && ph > 30) {
          if (s < 3.5) {
            ctx.fillStyle = '#0f172a';
            const fs = Math.min(13 / s, 15);
            ctx.font = `600 ${fs}px ui-monospace, monospace`;
            const pct = (100 * g.value / this.total).toFixed(1);
            ctx.fillText(`${g.name.toUpperCase()} ${pct}%`, g.x + 3 / s, g.y + fs, g.w - 6 / s);
          }
        }
      }
    }
  }

  hitTest(px, py) {
    const x = (px - this.tx) / this.scale, y = (py - this.ty) / this.scale;
    return this.leaves.find(n => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) || null;
  }

  bindEvents() {
    const c = this.canvas;
    let dragging = false, lx = 0, ly = 0, moved = 0;
    c.addEventListener('pointerdown', e => { dragging = true; moved = 0; lx = e.offsetX; ly = e.offsetY; });
    c.addEventListener('pointermove', e => {
      if (dragging) {
        this.tx += e.offsetX - lx; this.ty += e.offsetY - ly;
        moved += Math.abs(e.offsetX - lx) + Math.abs(e.offsetY - ly);
        lx = e.offsetX; ly = e.offsetY;
        this.draw();
      } else {
        const h = this.hitTest(e.offsetX, e.offsetY);
        if (h !== this.hovered) { this.hovered = h; this.draw(); }
        this.onHover && this.onHover(h, e.offsetX, e.offsetY);
      }
    });
    c.addEventListener('pointerup', e => {
      dragging = false;
      if (moved < 5) {
        const h = this.hitTest(e.offsetX, e.offsetY);
        if (h) this.zoomTo(h);
      }
    });
    c.addEventListener('pointerleave', () => { dragging = false; this.hovered = null; this.draw(); this.onHover && this.onHover(null); });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.pow(2, -e.deltaY * 0.0012);
      const ns = Math.min(300, Math.max(0.8, this.scale * f));
      const r = ns / this.scale;
      this.tx = e.offsetX - r * (e.offsetX - this.tx);
      this.ty = e.offsetY - r * (e.offsetY - this.ty);
      this.scale = ns;
      this.draw();
      this.onZoom && this.onZoom(this.scale);
    }, { passive: false });
  }

  zoomTo(node) {
    const W = this.canvas.width / devicePixelRatio, H = this.canvas.height / devicePixelRatio;
    const target = Math.min(280, 0.85 * Math.min(W / node.w, H / node.h));
    const cx = node.x + node.w / 2, cy = node.y + node.h / 2;
    const s0 = this.scale, tx0 = this.tx, ty0 = this.ty;
    const s1 = target, tx1 = W / 2 - s1 * cx, ty1 = H / 2 - s1 * cy;
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 700), e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2;
      this.scale = s0 + (s1 - s0) * e;
      this.tx = tx0 + (tx1 - tx0) * e;
      this.ty = ty0 + (ty1 - ty0) * e;
      this.draw();
      this.onZoom && this.onZoom(this.scale);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  reset() { this.tx = 0; this.ty = 0; this.scale = 1; this.draw(); this.onZoom && this.onZoom(1); }

  animateLayout(mutate) {
    const prev = new Map(this.leaves.map(n => [n, { x: n.x, y: n.y, w: n.w, h: n.h }]));
    mutate();
    this.buildTree();
    this.layout();
    const targets = new Map(this.leaves.map(n => [n, { x: n.x, y: n.y, w: n.w, h: n.h }]));
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 550);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      for (const n of this.leaves) {
        const a = prev.get(n), b = targets.get(n);
        if (a && b) {
          n.x = a.x + (b.x - a.x) * e; n.y = a.y + (b.y - a.y) * e;
          n.w = a.w + (b.w - a.w) * e; n.h = a.h + (b.h - a.h) * e;
        } else if (b) { n.x = b.x; n.y = b.y; n.w = b.w; n.h = b.h; }
      }
      this.draw();
      if (p < 1) requestAnimationFrame(step);
      else { for (const n of this.leaves) { const b = targets.get(n); if (b) Object.assign(n, b); } this.draw(); }
    };
    requestAnimationFrame(step);
  }

  setYear(idx) {
    if (!this.data.years) return;
    this.animateLayout(() => {
      for (const it of this.data.items) {
        if (it.values) it.value = it.values[idx] != null ? it.values[idx] : 0;
      }
    });
  }

  setColorMode(m) { this.colorMode = m; this.draw(); }

  setGrouped(g) {
    const prev = new Map(this.leaves.map(n => [n, { x: n.x, y: n.y, w: n.w, h: n.h }]));
    this.grouped = g;
    this.buildTree();
    this.layout();
    const targets = new Map(this.leaves.map(n => [n, { x: n.x, y: n.y, w: n.w, h: n.h }]));
    this.tx = 0; this.ty = 0; this.scale = 1;
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 700);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      for (const n of this.leaves) {
        const a = prev.get(n), b = targets.get(n);
        if (a && b) {
          n.x = a.x + (b.x - a.x) * e; n.y = a.y + (b.y - a.y) * e;
          n.w = a.w + (b.w - a.w) * e; n.h = a.h + (b.h - a.h) * e;
        }
      }
      this.draw();
      if (p < 1) requestAnimationFrame(step);
      else { for (const n of this.leaves) { const b = targets.get(n); if (b) Object.assign(n, b); } this.draw(); }
    };
    requestAnimationFrame(step);
    this.onZoom && this.onZoom(1);
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = r.width * devicePixelRatio;
    this.canvas.height = r.height * devicePixelRatio;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.layout();
    this.draw();
  }
}
