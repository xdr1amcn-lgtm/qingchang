/* Motion follows user actions; live metric refreshes never call these helpers. */
window.QingchangMotion = (() => {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = (node, frames, options = {}) => {
    if (!node || reduced()) return;
    return node.animate(frames, { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)', ...options });
  };
  const selectors = ['.d-sidebar .nav-link.is-active', '.workflow-phases .active', '.role-switch .active'];
  function snapshot() {
    return selectors.map(selector => {
      const node = document.querySelector(selector);
      return node ? { selector, rect: node.getBoundingClientRect(), text: node.textContent } : null;
    }).filter(Boolean);
  }
  function enter(previous, selector) {
    animate(document.querySelector(selector), [{ opacity: .65, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }]);
    for (const item of previous) {
      const node = document.querySelector(item.selector);
      if (!node || node.textContent === item.text) continue;
      const rect = node.getBoundingClientRect();
      // Move only the selection marker, keeping labels readable during navigation.
      const marker = document.createElement('i');
      marker.className = 'q-motion-marker';
      marker.setAttribute('aria-hidden', 'true');
      const tab = item.selector.includes('workflow-phases');
      Object.assign(marker.style, { left: `${rect.left}px`, top: `${tab ? rect.bottom - 3 : rect.top + 8}px`, width: `${tab ? rect.width : 3}px`, height: `${tab ? 3 : rect.height - 16}px` });
      document.body.append(marker);
      if (reduced()) { marker.remove(); continue; }
      node.classList.add('q-marker-moving');
      const motion = animate(marker, [{ transform: `translate(${item.rect.left - rect.left}px,${item.rect.top - rect.top}px)` }, { transform: 'none' }], { duration: 200 });
      motion.finished.catch(() => {}).finally(() => { marker.remove(); node.classList.remove('q-marker-moving'); });
    }
  }
  function confirm(selector) {
    animate(document.querySelector(selector), [{ boxShadow: '0 0 0 3px #2869e850', backgroundColor: '#edf3ff' }, { boxShadow: '0 0 0 0px transparent' }], { duration: 480 });
  }
  async function action(event, handler) {
    const button = event.target.closest('button');
    if (button?.dataset.motionPending) return;
    if (button) button.dataset.motionPending = 'true';
    // Short actions stay instant. Only a genuinely pending promise gets a spinner.
    const timer = setTimeout(() => {
      if (button?.isConnected) { button.classList.add('q-action-pending'); button.setAttribute('aria-busy', 'true'); }
    }, 180);
    try { return await handler(event); }
    finally { clearTimeout(timer); if (button) { delete button.dataset.motionPending; button.classList.remove('q-action-pending'); button.removeAttribute('aria-busy'); } }
  }
  return { snapshot, enter, confirm, action };
})();
