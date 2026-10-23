// Image data is bundled locally so file:// previews can also export clean canvases.
const templateImages = new Map();
const templateLoads = new Map();
function ensureTemplateImage(t) {
  if (!t.src) return Promise.resolve(null);
  if (templateImages.has(t.src)) return Promise.resolve(templateImages.get(t.src));
  if (!templateLoads.has(t.src)) {
    const image = new Image();
    image.src = t.src;
    templateLoads.set(t.src, image.decode().then(() => {
      templateImages.set(t.src, image);
      // Keep only a few full-resolution decoded backgrounds in memory.
      if (templateImages.size > 6) {
        const oldest = templateImages.keys().next().value;
        templateImages.delete(oldest);
        templateLoads.delete(oldest);
      }
      return image;
    }).catch(() => {
      templateLoads.delete(t.src);
      throw new Error('底圖載入失敗，請重新選擇模板。');
    }));
  }
  return templateLoads.get(t.src);
}

function renderAsset(target, t) {
  const c = target.getContext('2d'), W = target.width, H = target.height;
  c.fillStyle = t.bg;
  c.fillRect(0, 0, W, H);
  const image = state.background?.image || templateImages.get(t.src);
  if (!image) {
    c.fillStyle = t.ink;
    textFit(c, '正在準備風格底圖…', W / 2, H / 2, W * .8, 28, 'sans-serif');
    ensureTemplateImage(t).then(() => { if (templates[state.selected] === t) update(); }).catch(e => notice(e.message));
    return;
  }
  // Contain the entire artwork: news banners and illustrated borders remain visible.
  const fit = Math.min(W / image.width, H / image.height);
  const w = image.width * fit, h = image.height * fit;
  c.save();
  c.translate((W - w) / 2, (H - h) / 2);
  c.drawImage(image, 0, 0, w, h);
  if (state.background) {
    c.globalAlpha = Number($('overlay').value) / 100;
    c.fillStyle = t.bg;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }
  c.beginPath();c.rect(0, 0, w, h);c.clip();
  const n = state.photos.length;
  const scale = Number($('photo-area-size').value) / 100;
  const offset = Number($('photo-area-y').value) / 100;
  const area = t.photoArea || (t.news ? {x:.14, y:.20, w:.72, h:.39} : {x:.19, y:.36, w:.62, h:.30});
  const aw = area.w * scale, ah = area.h * scale;
  const ax = area.x + (area.w - aw) / 2, ay = Math.max(.02, Math.min(.98 - ah, area.y + offset + (area.h - ah) / 2));
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), gap = .012;
  state.photos.forEach((p, i) => {
    const pw = (aw - gap * (cols - 1)) / cols * w;
    const ph = (ah - gap * (rows - 1)) / rows * h;
    const x = ax * w + (i % cols) * (pw + gap * w);
    const y = ay * h + Math.floor(i / cols) * (ph + gap * h);
    c.save();c.beginPath();c.roundRect(x, y, pw, ph, t.news ? 0 : w * .008);c.clip();
    cover(c, p.image, x, y, pw, ph, p.zoom, p.x, p.y);c.restore();
  });
  if ($('show-text').checked) {
    const serif = 'Georgia,"PMingLiU",serif';
    const sans = '"Segoe UI","Microsoft JhengHei",sans-serif';
    const font = $('font').value === 'serif' ? serif : sans;
    const size = Number($('font-size').value) / 100;
    const dy = Number($('text-area-y').value) / 100;
    const lines = $('title').value.split('\n').slice(0, 4);
    c.fillStyle = $('text-color').value;
    if (t.henry) {
      textFit(c,$('brand').value,w*.5,h*(.08+dy),w*.65,w*.018*size,sans);
      lines.forEach((line,i) => textFit(c,line,w*.5,h*(.135+dy+i*.08/Math.max(2,lines.length)),w*.70,w*.048*size*Math.min(1,2/lines.length),font));
      textFit(c,$('subtitle').value,w*.5,h*(.23+dy),w*.70,w*.019*size,sans);
      textFit(c,$('footer-text').value,w*.5,h*(.255+dy),w*.70,w*.013*size,sans);
    } else if (t.news) {
      // User copy stays above the existing bottom ticker.
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.fillRect(w * .13, h * (.605 + dy), w * .74, h * .125);
      c.fillStyle = $('text-color').value;
      textFit(c, $('brand').value, w*.5, h*(.18+dy), w*.65, w*.021*size, sans);
      lines.forEach((line,i) => textFit(c,line,w*.5,h*(.637+dy+i*.05/Math.max(2,lines.length)),w*.67,w*.037*size*Math.min(1,2/lines.length),font));
      textFit(c,$('subtitle').value,w*.5,h*(.697+dy),w*.67,w*.018*size,sans);
      textFit(c,$('footer-text').value,w*.5,h*(.719+dy),w*.67,w*.013*size,sans);
    } else {
      textFit(c,$('brand').value,w*.5,h*(.17+dy),w*.64,w*.018*size,sans);
      lines.forEach((line,i) => textFit(c,line,w*.5,h*(.23+dy+i*.09/Math.max(2,lines.length)),w*.64,w*.052*size*Math.min(1,2/lines.length),font));
      textFit(c,$('subtitle').value,w*.5,h*(.71+dy),w*.62,w*.021*size,sans);
      textFit(c,$('footer-text').value,w*.5,h*(.75+dy),w*.62,w*.014*size,sans);
    }
  }
  c.restore();
}

function buildTemplateGrid() {
  const category = $('style-category').value;
  $('template-grid').replaceChildren();
  let count = 0;
  templates.forEach((t, i) => {
    if (t.category !== category) return;
    count++;
    const button = document.createElement('button');
    button.className = 'template' + (i === state.selected ? ' selected' : '');
    button.setAttribute('aria-pressed', String(i === state.selected));
    button.setAttribute('aria-label', `選擇${t.name}版型`);
    if (t.thumb) {
      const img = document.createElement('img');
      img.src = t.thumb;img.alt = t.name;img.loading = 'lazy';
      button.append(img);
    } else {
      const thumb = document.createElement('canvas');
      thumb.width = 320;thumb.height = 400;thumb.setAttribute('aria-hidden','true');
      render(thumb,t,true);button.append(thumb);
    }
    const label = document.createElement('span');label.textContent = `${String(t.number).padStart(2,'0')}  ${t.name}`;
    button.append(label);
    button.onclick = () => {
      state.selected = i;
      state.background = null;
      $('background-controls').hidden = true;
      $('text-color').value = t.ink;
      $('photo-area-size').value = 100;$('photo-area-y').value = 0;$('text-area-y').value = 0;
      buildTemplateGrid();update();
    };
    $('template-grid').append(button);
  });
  $('style-count').textContent = `${count} 款 / 共 ${templates.length} 款`;
}
