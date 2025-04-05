importScripts('/js/metrics-parser.js');

self.onmessage = async (e) => {
    const { type } = e.data;
  
    if (type === 'fetch_metrics') {
      try {
        const res = await fetch('/metrics');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
        const text = await res.text();
        const data = parsePrometheusMetrics(text);
  
        self.postMessage({ type: 'metrics_result', payload: data });
  
      } catch (err) {
        self.postMessage({
          type: 'metrics_error',
          error: err.message || 'Unknown error',
        });
      }
    }
  };
  