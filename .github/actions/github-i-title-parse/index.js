const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = core.getInput('token', { required: true });
    const title = core.getInput('title', { required: true });
    const keyword = core.getInput('keyword', { required: true });
    const debug = core.getInput('debug') === 'true';

    if (debug) {
      console.log(`Title to parse: ${title}`);
      console.log(`Keyword to search for: ${keyword}`);
    }

    const isTitleValid = parseTitle(title, keyword);

    core.setOutput('boolean', isTitleValid);
  } catch (error) {
    core.setFailed(error.message);
  }
}

function parseTitle(title, keyword) {
  return title.toLowerCase().includes(keyword.toLowerCase());
}

run();
