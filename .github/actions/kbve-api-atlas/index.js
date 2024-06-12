const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

async function run() {
try {
  const kbve_api = core.getInput('kbve_api');
  const system = core.getInput('system');
  const message = core.getInput('message');
  const model = core.getInput('model');
  const token = core.getInput('token');

  const payload = JSON.stringify({
    system,
    message,
    model,
  });

  const headers = {
    'Content-Type': 'application/json',
  };

  if (kbve_api) {
    headers['Authorization'] = `Bearer ${kbve_api}`;
  }

  const response = await axios.post(
    'https://rust.kbve.com/api/v1/call_groq',
    payload,
    {
      headers: headers,
    },
  );

  core.setOutput('response', response.data);

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