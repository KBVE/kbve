const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

try {
  const kbve_api = core.getInput('kbve_api');
  const system = core.getInput('system');
  const message = core.getInput('message');
  const model = core.getInput('model');
  const token = core.getInput('token');


  const payload = JSON.stringify({
    system,
    message,
    model
  });

  // Example usage of axios
  axios
    .get('https://api.example.com/data')
    .then((response) => {
      console.log(response.data);
      core.setOutput('response', response.data);
    })
    .catch((error) => {
      core.setFailed(error.message);
    });

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
