(() => {
  'use strict';

  const replaceBrand = (value) => String(value || '')
    .replace(/CONDUIT CRM/g, 'CONDUIT CRM')
    .replace(/Conduit CRM/g, 'Conduit CRM')
    .replace(/CONDUIT/g, 'CONDUIT')
    .replace(/Conduit/g, 'Conduit')
    .replace(/CONDUIT V2/g, 'CONDUIT CRM')
    .replace(/Conduit v2/g, 'Conduit CRM')
    .replace(/CONDUIT/g, 'CONDUIT')
    .replace(/Conduit/g, 'Conduit');

  function rebrand(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const next = replaceBrand(root.nodeValue);
      if (next !== root.nodeValue) root.nodeValue = next;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root !== document.body) return;
    const element = root.nodeType === Node.ELEMENT_NODE ? root : document.body;
    if (element.matches?.('script,style,noscript')) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('script,style,noscript') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const next = replaceBrand(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    const candidates = [element, ...element.querySelectorAll?.('[placeholder],[title],[aria-label]') || []];
    candidates.forEach((candidate) => ['placeholder', 'title', 'aria-label'].forEach((attribute) => {
      if (!candidate.hasAttribute?.(attribute)) return;
      const value = candidate.getAttribute(attribute), next = replaceBrand(value);
      if (next !== value) candidate.setAttribute(attribute, next);
    }));
  }

  function updatePipelineGuide(board, guide) {
    const columns = [...board.querySelectorAll(':scope > .pipeline-column')];
    if (!columns.length || !board.clientWidth) return;
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    const progress = max ? Math.max(0, Math.min(1, board.scrollLeft / max)) : 0;
    const nearest = columns.reduce((best, column, index) => Math.abs(column.offsetLeft - board.scrollLeft) < best.distance ? { index, distance: Math.abs(column.offsetLeft - board.scrollLeft) } : best, { index: 0, distance: Infinity }).index;
    guide.querySelector('[data-pipeline-position]').textContent = `${nearest + 1} / ${columns.length}`;
    guide.querySelector('.pipeline-scroll-track i').style.transform = `translateX(${progress * (columns.length - 1) * 100}%)`;
    guide.querySelector('[data-pipeline-scroll="prev"]').disabled = board.scrollLeft <= 3;
    guide.querySelector('[data-pipeline-scroll="next"]').disabled = max > 1 && board.scrollLeft >= max - 3;
  }

  function decoratePipeline(board) {
    if (board.dataset.conduitHorizontal === 'true') return;
    board.dataset.conduitHorizontal = 'true';
    const guide = document.createElement('div');
    guide.className = 'pipeline-scroll-guide';
    guide.innerHTML = '<button type="button" data-pipeline-scroll="prev" aria-label="Previous pipeline phase">‹</button><div><b>Swipe or scroll through the pipeline</b><small data-pipeline-position>1 / 6</small><span class="pipeline-scroll-track" aria-hidden="true"><i></i></span></div><button type="button" data-pipeline-scroll="next" aria-label="Next pipeline phase">›</button>';
    board.before(guide);
    const move = (direction) => {
      const column = board.querySelector('.pipeline-column');
      board.scrollBy({ left: direction * ((column?.getBoundingClientRect().width || board.clientWidth * .8) + 11), behavior: 'smooth' });
    };
    guide.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pipeline-scroll]');
      if (button) { move(button.dataset.pipelineScroll === 'next' ? 1 : -1); requestAnimationFrame(() => updatePipelineGuide(board, guide)); }
    });
    let frame = 0;
    board.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => updatePipelineGuide(board, guide));
    }, { passive: true });
    let dragging = false, startX = 0, startScroll = 0;
    board.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || event.target.closest('button,a,input,select,textarea,.pipeline-card')) return;
      dragging = true; startX = event.clientX; startScroll = board.scrollLeft;
      board.classList.add('is-drag-scrolling'); board.setPointerCapture(event.pointerId);
    });
    board.addEventListener('pointermove', (event) => { if (dragging) board.scrollLeft = startScroll - (event.clientX - startX); });
    const stop = (event) => { if (!dragging) return; dragging = false; board.classList.remove('is-drag-scrolling'); try { board.releasePointerCapture(event.pointerId); } catch {} };
    board.addEventListener('pointerup', stop); board.addEventListener('pointercancel', stop);
    requestAnimationFrame(() => updatePipelineGuide(board, guide));
  }

  function enhance(root = document) {
    rebrand(root === document ? document.body : root);
    const boards = root.querySelectorAll?.('.pipeline-board.structured') || [];
    boards.forEach(decoratePipeline);
    document.title = 'Conduit CRM · Solar Revenue Workspace';
  }

  const start = () => {
    enhance(document);
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => enhance(node))));
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', () => requestAnimationFrame(() => document.querySelectorAll('.pipeline-board.structured').forEach((board) => {
      const guide = board.previousElementSibling?.classList.contains('pipeline-scroll-guide') ? board.previousElementSibling : null;
      if (guide) updatePipelineGuide(board, guide);
    })), true);
    window.addEventListener('resize', () => document.querySelectorAll('.pipeline-board.structured').forEach((board) => {
      const guide = board.previousElementSibling?.classList.contains('pipeline-scroll-guide') ? board.previousElementSibling : null;
      if (guide) updatePipelineGuide(board, guide);
    }), { passive: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
