const core = require('@actions/core');
const github = require('@actions/github');
const localtunnel = require('localtunnel');

async function run() {
    try {
        const port = core.getInput('port');
        const tunnel = await localtunnel({ port });
    
        console.log(`Tunnel URL: ${tunnel.url}`);
        core.setOutput('tunnel_url', tunnel.url);
    
        // Keep the tunnel open for 6 hours.
        setTimeout(() => {
          tunnel.close();
          console.log('Tunnel closed');
        }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
    
      } catch (error) {
        core.setFailed(`Action failed with error: ${error.message}`);
      }
}

run();
