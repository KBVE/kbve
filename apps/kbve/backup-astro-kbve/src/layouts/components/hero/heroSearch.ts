const onSearchRendered = () => {
  console.log('[CSE] Results rendered — applying styles');

  const apply = (selector: string, styles: Partial<CSSStyleDeclaration>) => {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) {
      Object.assign(el.style, styles);
    }
  };

  apply('.gcsc-more-maybe-branding-root', {
    backgroundColor: '#0c0a09',
  });

  apply('.gsc-cursor-box.gs-bidi-start-align', {
    backgroundColor: '#0c0a09',
  });

  apply('.gsc-results.gsc-webResult', {
    backgroundColor: '#0c0a09',
    borderRadius: '0.5rem',
    padding: '1rem',
  });

  apply('.gsc-results.gsc-imageResult.gsc-imageResult-popup', {
    backgroundColor: '#0c0a09',
    borderRadius: '0.5rem',
    padding: '1rem',
  });

  apply('.gsc-expansionArea', {
    backgroundColor: '#0c0a09',
    borderTop: '1px solid #1f1f1f',
  });
};

(window as any).__gcse = (window as any).__gcse || {};
(window as any).__gcse.searchCallbacks = {
  web: {
    rendered: onSearchRendered,
  },
  image: {
    rendered: onSearchRendered,
  },
};