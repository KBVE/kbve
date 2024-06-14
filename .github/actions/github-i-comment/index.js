const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = core.getInput('token', { required: true });
    const issueNumber = core.getInput('issue_number', { required: true });
    const commentBody = core.getInput('comment_body', { required: true });
    const debug = core.getInput('debug') === 'true';

    if (debug) {
      console.log('Inputs:');
      console.log(`Issue Number: ${issueNumber}`);
      console.log(`Comment Body: ${commentBody}`);
    }

    const octokit = github.getOctokit(token);

    const context = github.context;

    const response = await octokit.issues.createComment({
      ...context.repo,
      issue_number: issueNumber,
      body: commentBody,
    });

    core.setOutput('comment_id', response.data.id);

    if (debug) {
      console.log('Response:');
      console.log(response);
      console.log('----');
      console.log('----');
      console.log(`comment_id=${response.data.id}`);
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
