function parsePrometheusMetrics(text, limit = 6) {
    return text
        .split('\n')
        .filter(line => line && !line.startsWith('#'))
        .slice(0, limit)
        .map(line => {
            const [key, value] = line.trim().split(/\s+/);
            return { key, value };
        });
}

if (typeof module !== 'undefined') {
    module.exports = { parsePrometheusMetrics };
}