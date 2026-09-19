/* CREC 0.1.1.1 — product card magnifier.
 * Works with dynamically rendered catalog cards via event delegation.
 * Does not mutate product-card dimensions and does not intercept clicks.
 */
(() => {
  'use strict';

  const INSTANCE_KEY = '__crecMagnifierV1137';
  if (window[INSTANCE_KEY]) return;

  const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)');
  const IMAGE_SELECTOR = '.product-card .product-picture img, .product-card .product-media img, .product-card img[data-product-image], .product-card img';
  const ZOOM = 2.5;

  let lens = null;
  let activeImage = null;

  function ensureLens() {
    if (lens) return lens;
    lens = document.createElement('div');
    lens.className = 'crec-magnifier-lens';
    lens.setAttribute('aria-hidden', 'true');
    document.body.appendChild(lens);
    return lens;
  }

  function hideLens() {
    activeImage = null;
    if (lens) lens.classList.remove('is-visible');
  }

  function renderedImageBox(img) {
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height || !img.naturalWidth || !img.naturalHeight) return null;

    const style = getComputedStyle(img);
    const fit = style.objectFit || 'fill';
    const position = (style.objectPosition || '50% 50%').trim().split(/\s+/);

    let width = rect.width;
    let height = rect.height;

    if (fit === 'contain' || fit === 'cover' || fit === 'scale-down') {
      const containScale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      const coverScale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      let scale = fit === 'cover' ? coverScale : containScale;
      if (fit === 'scale-down') scale = Math.min(1, containScale);
      width = img.naturalWidth * scale;
      height = img.naturalHeight * scale;
    } else if (fit === 'none') {
      width = img.naturalWidth;
      height = img.naturalHeight;
    }

    function positionOffset(token, freeSpace) {
      if (!token) return freeSpace / 2;
      if (token === 'left' || token === 'top') return 0;
      if (token === 'right' || token === 'bottom') return freeSpace;
      if (token === 'center') return freeSpace / 2;
      if (token.endsWith('%')) {
        const pct = Number.parseFloat(token);
        return Number.isFinite(pct) ? freeSpace * pct / 100 : freeSpace / 2;
      }
      if (token.endsWith('px')) {
        const px = Number.parseFloat(token);
        return Number.isFinite(px) ? px : freeSpace / 2;
      }
      return freeSpace / 2;
    }

    const xToken = position[0] || '50%';
    const yToken = position[1] || position[0] || '50%';
    const left = rect.left + positionOffset(xToken, rect.width - width);
    const top = rect.top + positionOffset(yToken, rect.height - height);

    return { left, top, width, height };
  }

  function updateLens(event, img) {
    if (!FINE_POINTER.matches || !img.complete || !img.naturalWidth || !img.naturalHeight) {
      hideLens();
      return;
    }

    const box = renderedImageBox(img);
    if (!box) {
      hideLens();
      return;
    }

    const x = event.clientX - box.left;
    const y = event.clientY - box.top;

    // With object-fit: contain, the <img> box may include blank letterboxing.
    if (x < 0 || y < 0 || x > box.width || y > box.height) {
      hideLens();
      return;
    }

    const node = ensureLens();
    activeImage = img;

    const src = img.currentSrc || img.src;
    if (!src) {
      hideLens();
      return;
    }

    const lensWidth = node.offsetWidth || 288;
    const lensHeight = node.offsetHeight || 288;
    const backgroundWidth = box.width * ZOOM;
    const backgroundHeight = box.height * ZOOM;
    const backgroundX = lensWidth / 2 - x * ZOOM;
    const backgroundY = lensHeight / 2 - y * ZOOM;

    node.style.left = `${event.clientX}px`;
    node.style.top = `${event.clientY}px`;
    node.style.backgroundImage = `url(${JSON.stringify(src)})`;
    node.style.backgroundSize = `${backgroundWidth}px ${backgroundHeight}px`;
    node.style.backgroundPosition = `${backgroundX}px ${backgroundY}px`;
    node.classList.add('is-visible');
  }

  function matchingImage(target) {
    if (!(target instanceof Element)) return null;
    const img = target.closest(IMAGE_SELECTOR);
    return img instanceof HTMLImageElement ? img : null;
  }

  function onPointerMove(event) {
    const img = matchingImage(event.target);
    if (!img) {
      if (activeImage) hideLens();
      return;
    }
    updateLens(event, img);
  }

  function onPointerOut(event) {
    if (!activeImage) return;
    const related = event.relatedTarget;
    if (related instanceof Node && activeImage.contains(related)) return;
    if (event.target === activeImage) hideLens();
  }

  function onPointerDown() { hideLens(); }
  function onScroll() { hideLens(); }
  function onBlur() { hideLens(); }
  function onCapabilityChange() { if (!FINE_POINTER.matches) hideLens(); }

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('blur', onBlur);
  if (typeof FINE_POINTER.addEventListener === 'function') {
    FINE_POINTER.addEventListener('change', onCapabilityChange);
  } else if (typeof FINE_POINTER.addListener === 'function') {
    FINE_POINTER.addListener(onCapabilityChange);
  }

  window[INSTANCE_KEY] = Object.freeze({
    version: '0.1.3.7',
    hide: hideLens
  });
})();
