(() => {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: false });

  const importBtn = document.getElementById('importBtn');
  const importMenu = document.getElementById('importMenu');
  const pasteBtn = document.getElementById('pasteBtn');
  const chooseFileBtn = document.getElementById('chooseFileBtn');
  const fitBtn = document.getElementById('fitBtn');
  const rotateLeftBtn = document.getElementById('rotateLeftBtn');
  const rotateRightBtn = document.getElementById('rotateRightBtn');
  const lockBtn = document.getElementById('lockBtn');
  const zoomRange = document.getElementById('zoomRange');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');
  const fileInput = document.getElementById('fileInput');

  const state = {
    img: null,
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    locked: false,
  };

  const pointers = new Map();
  let gestureStart = null;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function clampScale(s) {
    return Math.max(0.05, Math.min(8, s));
  }

  function updateZoomUI() {
    if (zoomRange) zoomRange.value = String(state.scale);
    setStatus(`${Math.round(state.scale * 100)}%`);
  }

  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#111318';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    resizeCanvasToDisplaySize();
    clear();
    if (!state.img) return;

    const cx = canvas.width / 2 + state.offsetX;
    const cy = canvas.height / 2 + state.offsetY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.rotation);
    ctx.scale(state.scale, state.scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
    ctx.restore();
  }

  function fitToScreen() {
    if (!state.img) return;
    resizeCanvasToDisplaySize();
    const margin = 0.95;
    const s = Math.min(
      (canvas.width * margin) / state.img.width,
      (canvas.height * margin) / state.img.height
    );
    state.scale = clampScale(s);
    state.rotation = 0;
    state.offsetX = 0;
    state.offsetY = 0;
    updateZoomUI();
    draw();
  }

  function screenToWorld(screenX, screenY) {
    const cx = canvas.width / 2 + state.offsetX;
    const cy = canvas.height / 2 + state.offsetY;
    const x = screenX - cx;
    const y = screenY - cy;

    const cos = Math.cos(-state.rotation);
    const sin = Math.sin(-state.rotation);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return { x: rx / state.scale, y: ry / state.scale };
  }

  function getCanvasPointFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    return {
      x: (clientX - rect.left) * dpr,
      y: (clientY - rect.top) * dpr,
    };
  }

  function loadImageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.img = img;
      if (hintEl) hintEl.classList.add('hidden');
      fitToScreen();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus('Failed to load image');
    };
    img.src = url;
  }

  function onPaste(e) {
    if (!e.clipboardData) return;
    const items = Array.from(e.clipboardData.items || []);
    const imageItem = items.find((it) => it.type && it.type.startsWith('image/'));
    if (!imageItem) return;
    const blob = imageItem.getAsFile();
    if (!blob) return;
    e.preventDefault();
    loadImageFromBlob(blob);
  }

  function setImportMenuOpen(open) {
    if (!importMenu || !importBtn) return;
    importMenu.classList.toggle('hidden', !open);
    importBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  async function pasteFromClipboard() {
    if (state.locked) return;
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      setStatus('Clipboard paste not supported here');
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        loadImageFromBlob(blob);
        return;
      }

      for (const item of items) {
        const htmlType = item.types.find((t) => t === 'text/html');
        if (!htmlType) continue;
        const htmlBlob = await item.getType(htmlType);
        const html = await htmlBlob.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const imgEl = doc.querySelector('img');
        const src = imgEl && imgEl.getAttribute('src');
        if (!src) continue;
        if (src.startsWith('data:image/')) {
          const res = await fetch(src);
          const blob = await res.blob();
          loadImageFromBlob(blob);
          return;
        }
        if (/^https?:\/\//i.test(src)) {
          const res = await fetch(src);
          const blob = await res.blob();
          loadImageFromBlob(blob);
          return;
        }
      }

      if (typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        const trimmed = (text || '').trim();
        if (trimmed.startsWith('data:image/')) {
          const res = await fetch(trimmed);
          const blob = await res.blob();
          loadImageFromBlob(blob);
          return;
        }
        if (/^https?:\/\//i.test(trimmed) && /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(trimmed)) {
          const res = await fetch(trimmed);
          const blob = await res.blob();
          loadImageFromBlob(blob);
          return;
        }
      }

      const types = items
        .map((it) => (Array.isArray(it.types) ? it.types.join(',') : ''))
        .filter(Boolean)
        .join(' | ');
      
      if (types.includes('text/plain') && !types.includes('image')) {
        setStatus('Copy an image file, not text. Try Choose file instead.');
      } else {
        setStatus(types ? `Clipboard has no image (types: ${types})` : 'Clipboard has no image');
      }
    } catch (err) {
      setStatus('Clipboard read failed');
    }
  }

  function preventTouchScroll(e) {
    if (!state.locked) return;
    e.preventDefault();
  }

  function setLocked(locked) {
    state.locked = locked;
    document.body.classList.toggle('page-locked', locked);

    if (lockBtn) {
      lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
      lockBtn.textContent = locked ? 'Unlock' : 'Lock';
    }

    if (locked) {
      document.addEventListener('touchmove', preventTouchScroll, { passive: false });
      setStatus('Locked');
    } else {
      document.removeEventListener('touchmove', preventTouchScroll);
      updateZoomUI();
    }
  }

  function rotateBy(deltaRad) {
    if (!state.img) return;
    state.rotation += deltaRad;
    draw();
  }

  function onWheel(e) {
    if (state.locked || !state.img) return;
    e.preventDefault();

    const pt = getCanvasPointFromClient(e.clientX, e.clientY);
    const before = screenToWorld(pt.x, pt.y);
    const factor = Math.exp((-e.deltaY / 300) * 0.6);
    state.scale = clampScale(state.scale * factor);
    const after = screenToWorld(pt.x, pt.y);

    const dx = (after.x - before.x) * state.scale;
    const dy = (after.y - before.y) * state.scale;
    const cos = Math.cos(state.rotation);
    const sin = Math.sin(state.rotation);
    state.offsetX += dx * cos - dy * sin;
    state.offsetY += dx * sin + dy * cos;

    updateZoomUI();
    draw();
  }

  function getCentroidAndMetrics() {
    const pts = Array.from(pointers.values());
    if (pts.length === 0) return null;

    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

    if (pts.length === 1) {
      return { cx, cy, dist: 0, angle: 0, count: 1 };
    }

    const a = pts[0];
    const b = pts[1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { cx, cy, dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx), count: pts.length };
  }

  function onPointerDown(e) {
    if (state.locked || !state.img) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, getCanvasPointFromClient(e.clientX, e.clientY));
    const m = getCentroidAndMetrics();
    if (!m) return;
    gestureStart = {
      cx: m.cx,
      cy: m.cy,
      dist: m.dist,
      angle: m.angle,
      scale: state.scale,
      rotation: state.rotation,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
    };
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (state.locked || !state.img) return;
    if (!pointers.has(e.pointerId) || !gestureStart) return;

    pointers.set(e.pointerId, getCanvasPointFromClient(e.clientX, e.clientY));
    const m = getCentroidAndMetrics();
    if (!m) return;

    state.offsetX = gestureStart.offsetX + (m.cx - gestureStart.cx);
    state.offsetY = gestureStart.offsetY + (m.cy - gestureStart.cy);

    if (m.count >= 2 && gestureStart.dist > 0) {
      state.scale = clampScale(gestureStart.scale * (m.dist / gestureStart.dist));
      state.rotation = gestureStart.rotation + (m.angle - gestureStart.angle);
      updateZoomUI();
    }

    draw();
    e.preventDefault();
  }

  function onPointerUpOrCancel(e) {
    pointers.delete(e.pointerId);
    const m = getCentroidAndMetrics();
    if (!m) {
      gestureStart = null;
      return;
    }
    gestureStart = {
      cx: m.cx,
      cy: m.cy,
      dist: m.dist,
      angle: m.angle,
      scale: state.scale,
      rotation: state.rotation,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
    };
  }

  if (importBtn && importMenu) {
    importBtn.addEventListener('click', () => {
      if (state.locked) return;
      const isOpen = !importMenu.classList.contains('hidden');
      setImportMenuOpen(!isOpen);
    });
  } else if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
      if (state.locked) return;
      fileInput.click();
    });
  }

  if (chooseFileBtn && fileInput) {
    chooseFileBtn.addEventListener('click', () => {
      if (state.locked) return;
      setImportMenuOpen(false);
      fileInput.click();
    });
  }

  if (pasteBtn) {
    pasteBtn.addEventListener('click', () => {
      if (state.locked) return;
      setImportMenuOpen(false);
      setStatus('Press Cmd+V (or Ctrl+V) to paste image');
      setTimeout(() => {
        if (!state.img) setStatus('Ready');
      }, 3000);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      loadImageFromBlob(file);
      fileInput.value = '';
    });
  }

  document.addEventListener('click', (e) => {
    if (!importMenu || !importBtn) return;
    if (importMenu.classList.contains('hidden')) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (importMenu.contains(target) || importBtn.contains(target)) return;
    setImportMenuOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    setImportMenuOpen(false);
  });

  if (fitBtn) fitBtn.addEventListener('click', () => (!state.locked ? fitToScreen() : undefined));
  if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', () => (!state.locked ? rotateBy(-Math.PI / 18) : undefined));
  if (rotateRightBtn) rotateRightBtn.addEventListener('click', () => (!state.locked ? rotateBy(Math.PI / 18) : undefined));
  if (lockBtn) lockBtn.addEventListener('click', () => setLocked(!state.locked));

  if (zoomRange) {
    zoomRange.addEventListener('input', () => {
      if (state.locked || !state.img) return;
      state.scale = clampScale(Number(zoomRange.value));
      updateZoomUI();
      draw();
    });
  }

  document.addEventListener('paste', onPaste);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUpOrCancel);
  canvas.addEventListener('pointercancel', onPointerUpOrCancel);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', () => draw());

  setStatus('Ready');
  updateZoomUI();
  draw();
})();