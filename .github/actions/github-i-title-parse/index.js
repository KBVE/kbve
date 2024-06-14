const core = require('@actions/core');

async function run() {
  try {
    const title = process.env.TITLE;
    const keywords = JSON.parse(process.env.KEYWORD);
    const debug = process.env.DEBUG === 'true';

    if (debug) {
      console.log(`Title to parse: ${title}`);
      console.log(`Keywords: ${JSON.stringify(keywords)}`);
    }

    let matchedAction = 'none';

    for (const { keyword, action } of keywords) {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        matchedAction = action;
        break;
      }
    }

    core.setOutput('action', matchedAction);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
