const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = process.env.TOKEN;
    const issueNumber = process.env.ISSUE_NUMBER;
    const commentBody = process.env.COMMENT_BODY;
    const debug = process.env.DEBUG === 'true';

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
