interface GCSEConfig {
  callback?: () => void;
  initializationCallback?: () => void;
}

const gcse = (window as { __gcse?: GCSEConfig }).__gcse ?? {};
gcse.callback = () => {
  let attempts = 0;
  const interval = setInterval(() => {
    const branding = document.querySelector('.gcsc-more-maybe-branding-root');
    const pagination = document.querySelector('.gsc-cursor-box.gs-bidi-start-align');
    const results = document.querySelector('.gsc-results.gsc-webResult');
    const expansion = document.querySelector('.gsc-expansionArea');

    let styled = false;

    if (expansion instanceof HTMLElement)
    {
        expansion.style.backgroundColor = '#0c0a09';
        styled = true;
    }
    
    if (branding instanceof HTMLElement) {
      branding.style.backgroundColor = '#0c0a09';
      styled = true;
    }

    if (pagination instanceof HTMLElement) {
      pagination.style.backgroundColor = '#0c0a09';
      styled = true;
    }

    if (results instanceof HTMLElement) {
      results.style.backgroundColor = '#0c0a09';
      results.style.borderRadius = '0.5rem';
      results.style.padding = '1rem';
      styled = true;
    }

    if (styled) {
      console.log('Styled CSE elements');
      clearInterval(interval);
    }

    if (++attempts > 20) clearInterval(interval);
  }, 100);
};

(window as any).__gcse = gc
