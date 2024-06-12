const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

async function run() {
  try {
    let system = core.getInput('system');
    const kbve_api = core.getInput('kbve_api');
    const message = core.getInput('message');
    const model = core.getInput('model');
    const token = core.getInput('token');


    const headers = {
      'Content-Type': 'application/json',
    };

    if (kbve_api) {
      headers['Authorization'] = `Bearer ${kbve_api}`;
    }

    function isULID(str) {
      const ulidRegex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
      return ulidRegex.test(str);
    }

    if (isULID(system)) {
      const response = await axios.get('https://kbve.com/api/prompt/engine.json');
      const data = response.data.key;

      const prompt = data[system];

      if (!prompt) {
          throw new Error(`Prompt with ulid ${system} not found`);
      }

      console.log('Found prompt:', prompt);
      system = prompt.task;
  }

    const payload = JSON.stringify({
      system,
      message,
      model,
    });

    console.log('Found prompt:', prompt);

    const apiResponse = await axios.post(
      'https://rust.kbve.com/api/v1/call_groq',
      payload,
      {
        headers: headers,
      },
    );

    core.setOutput('response', apiResponse.data);

    // Going to include this below for test casing.

    // Example usage of @actions/github
    const context = github.context;
    const octokit = github.getOctokit(token);

    // List issues in the repository
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
    });

    console.log('Issues:', issues);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
