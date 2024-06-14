const core = require('@actions/core');
const axios = require('axios');

async function run() {
  try {
    const title = process.env.TITLE;
    const keywords_location = process.env.KEYWORD;
    const debug = process.env.DEBUG === 'true';

    const keywordResposne = await axios.get(keywords_location);
    const keywords = keywordResposne.data;

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
