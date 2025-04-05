// public/js/shared-worker.js
importScripts('/js/metrics-parser.js');

const subscriptions = new Map();
const pollers = {};

function broadcast(topic, payload) {
	const ports = subscriptions.get(topic);
	if (!ports) return;

	for (const port of ports) {
		port.postMessage({ topic, payload });
	}
}

function subscribe(port, topic) {
	if (!subscriptions.has(topic)) {
		subscriptions.set(topic, new Set());
		startPolling(topic);
	}
	subscriptions.get(topic).add(port);
}

function unsubscribe(port, topic) {
	const set = subscriptions.get(topic);
	if (set) {
		set.delete(port);
		if (set.size === 0) stopPolling(topic);
	}
}

function startPolling(topic) {
	if (topic === 'metrics') {
		pollers[topic] = setInterval(async () => {
			try {
				const res = await fetch('/metrics');
				const text = await res.text();
				const data = parsePrometheusMetrics(text);
				broadcast('metrics', data);
			} catch (err) {
				console.warn('Polling error:', err);
			}
		}, 3000);
	}
}

function stopPolling(topic) {
	clearInterval(pollers[topic]);
	delete pollers[topic];
}

self.onconnect = function (e) {
	const port = e.ports[0];

	port.onmessage = (event) => {
		const { type, topic } = event.data;

		if (type === 'subscribe') subscribe(port, topic);
		else if (type === 'unsubscribe') unsubscribe(port, topic);
	};

	port.start();
};
