import { listen } from "@colyseus/tools";

// Import Colyseus config
import app from "./app.config";

// Create and listen on 2567 (or PORT environment variable.)
listen(app);
