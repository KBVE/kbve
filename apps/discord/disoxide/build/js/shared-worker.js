importScripts('/js/metrics-parser.js');

const subscriptions = new Map();
const pollers = {};

// One-off request handlers
const handlers = {
	fetch_metrics: async () => {
		const res = await fetch('/metrics');
		const text = await res.text();
		return parsePrometheusMetrics(text);
	},

	// You can add more here later:
	// fetch_logs: async () => {
	//     const res = await fetch('/logs');
	//     const text = await res.text();
	//     return parseLogLines(text);
	// },
};

// Broadcast data to all ports subscribed to a topic
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
	const handlerFn = handlers[`fetch_${topic}`];

	if (!handlerFn) {
		console.warn(`No handler found for polling topic "${topic}"`);
		return;
	}

	pollers[topic] = setInterval(async () => {
		try {
			const data = await handlerFn();
			broadcast(topic, data);
		} catch (err) {
			console.warn(`Polling error for topic "${topic}":`, err);
		}
	}, 3000);
}

function stopPolling(topic) {
	clearInterval(pollers[topic]);
	delete pollers[topic];
}


self.onconnect = function (e) {
	const port = e.ports[0];

	port.onmessage = async (event) => {
		const { type, topic, requestId } = event.data;

		if (type === 'subscribe') {
			subscribe(port, topic);
		} else if (type === 'unsubscribe') {
			unsubscribe(port, topic);
		} else if (requestId && handlers[type]) {
			try {
				const result = await handlers[type]();
				port.postMessage({ type: `${type}_result`, payload: result, requestId });
			} catch (error) {
				port.postMessage({ type: `${type}_error`, error: error.message, requestId });
			}
		} else if (requestId) {
			port.postMessage({
				type: `${type}_error`,
				error: `Unknown request type: ${type}`,
				requestId,
			});
		}
	};

	port.start();
};
