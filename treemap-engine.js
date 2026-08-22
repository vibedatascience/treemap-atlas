export class Treemap {
  constructor(canvas, data, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.colorMode = opts.colorMode || 'category';
    this.grouped = opts.grouped !== false;
    this.tx = 0; this.ty = 0; this.scale = 1;
    this.hovered = null;
    this.palette = ['#E60023','#0a3069','#0d9488','#b45309','#7c3aed','#be185d','#475569','#166534','#0369a1','#a16207','#9f1239','#4d7c0f','#6d28d9','#78350f'];
    this.minFont = opts.minFont || 7;
    this.maxFont = opts.maxFont || 30;
    this.catColor = new Map();
    this.buildTree();
    this.bindEvents();
    this.resize();
  }

  decode(t) {
    return String(t).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  buildTree() {
    for (const d of this.data.items) d.name = this.decode(d.name);
    const items = this.data.items.filter(d => d.value > 0);
    const catTotal = new Map();
    for (const d of items) { const k = d.color_key || ''; catTotal.set(k, (catTotal.get(k) || 0) + d.value); }
    const cats = [...catTotal.keys()].sort((a, b) => catTotal.get(b) - catTotal.get(a));
    this.catTotal = catTotal;
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
    let W = this.canvas.width / devicePixelRatio, H = this.canvas.height / devicePixelRatio;
    let ox = 0, oy = 0;
    if (this.absoluteMode && this.maxTotal) {
      const cur = this.data.items.reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0);
      const f = Math.sqrt(Math.max(0.0001, cur / this.maxTotal));
      ox = W * (1 - f) / 2; oy = H * (1 - f) / 2;
      W *= f; H *= f;
    }
    this.ox = ox; this.oy = oy;
    const pad = 2, header = 18;
    if (this.root.children[0] && this.root.children[0].children) {
      this.squarify(this.root.children, ox, oy, W, H);
      for (const g of this.root.children) {
        const gx = g.x + pad, gy = g.y + header, gw = Math.max(0, g.w - pad * 2), gh = Math.max(0, g.h - header - pad);
        this.squarify(g.children, gx, gy, gw, gh);
      }
      this.leaves = this.root.children.flatMap(g => g.children);
    } else {
      this.squarify(this.root.children, ox, oy, W, H);
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

  balancedWrap(words, k, measure) {
    if (k === 1) return { lines: [words.join(' ')], width: measure(words.join(' ')) };
    const n = words.length;
    if (k > n) return null;
    const cost = (i, j) => measure(words.slice(i, j).join(' '));
    const dp = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
    const cut = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
    dp[0][0] = 0;
    for (let li = 1; li <= k; li++) {
      for (let j = li; j <= n; j++) {
        for (let i = li - 1; i < j; i++) {
          const w = Math.max(dp[li - 1][i], cost(i, j));
          if (w < dp[li][j]) { dp[li][j] = w; cut[li][j] = i; }
        }
      }
    }
    const lines = [];
    let j = n;
    for (let li = k; li >= 1; li--) { const i = cut[li][j]; lines.unshift(words.slice(i, j).join(' ')); j = i; }
    return { lines, width: dp[k][n] };
  }

  fitLabel(n, s) {
    const key = `${n.name}|${Math.round(n.w * s)}x${Math.round(n.h * s)}`;
    if (!this._labelCache) this._labelCache = new Map();
    if (this._labelCache.has(key)) return this._labelCache.get(key);
    if (this._labelCache.size > 4000) this._labelCache.clear();
    const ctx = this.ctx;
    const maxW = n.w - 8 / s;
    const words = n.name.split(' ');
    const base = 12;
    ctx.font = `${base}px ui-monospace, monospace`;
    const measure = t => ctx.measureText(t).width / base;
    let best = null;
    const maxLines = Math.min(3, words.length);
    for (let k = 1; k <= maxLines; k++) {
      const wrap = this.balancedWrap(words, k, measure);
      if (!wrap) continue;
      const cap = Math.max(13, Math.min(this.maxFont, Math.min(n.w, n.h) * s * 0.11));
      let fs = Math.min(cap / s, maxW / wrap.width, (n.h - 3 / s) / (k * 1.15 + 0.4));
      if (fs * s < this.minFont) continue;
      if (!best || fs > best.fs * 1.06) best = { fs, lines: wrap.lines, needH: fs * 1.15 * k + fs * 0.4 };
    }
    this._labelCache.set(key, best);
    return best;
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
        const fit = this.fitLabel(n, s);
        if (fit) {
          ctx.font = `${fit.fs}px ui-monospace, monospace`;
          ctx.fillStyle = '#ffffff';
          fit.lines.forEach((l, li) => ctx.fillText(l, n.x + 4 / s, n.y + fit.fs + 3 / s + li * fit.fs * 1.15));
          if (n.h > fit.needH + fit.fs * 1.3 && ph > 30) {
            ctx.font = `${fit.fs * 0.82}px ui-monospace, monospace`;
            const vt = this.fmt(n.value);
            if (ctx.measureText(vt).width <= n.w - 8 / s)
              ctx.fillText(vt, n.x + 4 / s, n.y + fit.fs + 3 / s + fit.lines.length * fit.fs * 1.15);
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
            const pct = (100 * g.value / this.total).toFixed(1);
            const avail = g.w - 6 / s;
            let t = `${g.name.toUpperCase()} ${pct}%`;
            let fs = Math.min(13 / s, 15);
            ctx.font = `600 ${fs}px ui-monospace, monospace`;
            while (fs * s > 9 && ctx.measureText(t).width > avail) { fs *= 0.92; ctx.font = `600 ${fs}px ui-monospace, monospace`; }
            if (ctx.measureText(t).width > avail) t = g.name.toUpperCase();
            while (t.length > 3 && ctx.measureText(t + '\u2026').width > avail) t = t.slice(0, -1);
            if (t !== g.name.toUpperCase() && !t.endsWith('%')) t += '\u2026';
            ctx.fillText(t, g.x + 3 / s, g.y + fs);
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

  computeMaxTotal() {
    if (!this.data.years) { this.maxTotal = null; return; }
    let mx = 0;
    for (let i = 0; i < this.data.years.length; i++) {
      let t = 0;
      for (const it of this.data.items) if (it.values && it.values[i] != null) t += it.values[i];
      mx = Math.max(mx, t);
    }
    this.maxTotal = mx;
  }

  setAbsolute(on) {
    this.absoluteMode = on;
    if (on && !this.maxTotal) this.computeMaxTotal();
    this.animateLayout(() => {});
  }

  setYear(idx) {
    this._labelCache = null;
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
