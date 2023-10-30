//*				[IMPORTS]
// Importing the Koa framework, which is a lightweight and efficient web framework for Node.js
// It is designed to be a smaller, more expressive, and more robust foundation for web applications and APIs.
import koa from 'koa';

// Importing the `koa-proxies` middleware, which allows the application to proxy requests to other servers.
// This can be useful in development environments, for cross-domain requests, or for routing requests to different microservices.
import proxy from 'koa-proxies';

// Importing the `koa-bodyparser` middleware, which parses incoming request bodies before your handlers are executed.
// This is useful for handling POST requests, or any request where you need to read data sent in the body in a JSON, text, or URL-encoded format.
import parser from 'koa-bodyparser';

// Defining a constant `host` which will hold the hostname for the server.
// It first checks if the `HOST` environment variable is set, using it as the hostname if present.
// If the `HOST` environment variable is not set, it defaults to 'localhost'.
const host = process.env.HOST ?? 'localhost';

// Defining a constant `port` which will hold the port number for the server.
// It first checks if the `PORT` environment variable is set, converting it to a number and using it as the port if present.
// If the `PORT` environment variable is not set, it defaults to 3000.
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Creating a new instance of a Koa application.
// This instance (`app`) will be used to configure and run the web server.
const app = new koa();

// Adding a middleware to the Koa application using the `use` method.
// This middleware is an asynchronous function that sets the response body to a JSON object with a message property.
// When a request is received, it will respond with { message: 'Hello API' }.
app.use(async (ctx) => {
	ctx.body = { message: 'Hello API' };
})
	// Chaining another middleware using the `use` method.
	// This middleware proxies requests sent to '/api' path to a different domain 'https://pb.kbve.com/'.
	// The `changeOrigin` option ensures the host header is updated to the target URL, and `logs` option enables logging.
	.use(
		proxy('/api', {
			target: 'https://pb.kbve.com/',
			changeOrigin: true,
			logs: true,
		})
	)
	// Chaining another middleware using the `use` method.
	// This middleware is the body parser which parses the incoming request body before your handlers are executed.
	.use(parser())
	// Starting the Koa application on the specified host and port.
	// A callback function is passed to the `listen` method, which logs a message to the console when the server is ready.
	.listen(port, host, () => {
		console.log(`[ ready ] http://${host}:${port}`);
	});
