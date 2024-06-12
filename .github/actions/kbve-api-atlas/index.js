const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const marked = require('marked');
const DOMPurify = require('dompurify')(new (require('jsdom').JSDOM)().window);
const { JSDOM } = require('jsdom');

// Function to check if the system input is a ULID
function isULID(str) {
  const ulidRegex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
  return ulidRegex.test(str);
}

// Function to convert markdown to a JSON-safe string
function markdownToJsonSafeString(markdownContent) {
  // Convert markdown to HTML
  const htmlContent = marked.parse(markdownContent);

  // Sanitize the HTML content
  const sanitizedHtmlContent = DOMPurify.sanitize(htmlContent);

  // Use jsdom to create a temporary DOM element to extract text content from sanitized HTML
  const dom = new JSDOM(sanitizedHtmlContent);
  const textContent = dom.window.document.body.textContent || '';

  // Ensure the text content is JSON-safe
  const jsonSafeString = JSON.stringify(textContent);

  return jsonSafeString;
}

const sanitizationFunctions = {
  3: markdownToJsonSafeString,
};

async function run() {
  try {
    let system = core.getInput('system');
    let message = core.getInput('message');
    const kbve_api = core.getInput('kbve_api');
    const model = core.getInput('model');
    const token = core.getInput('token');
    //const sanitization = core.getBooleanInput('sanitization');
    const sanitizationLevel = parseInt(core.getInput('sanitization'), 10);

    const headers = {
      'Content-Type': 'application/json',
    };

    if (kbve_api) {
      headers['Authorization'] = `Bearer ${kbve_api}`;
    }

    if (isULID(system)) {
      const response = await axios.get(
        'https://kbve.com/api/prompt/engine.json',
      );
      const data = response.data.key;

      const prompt = data[system];

      if (!prompt) {
        throw new Error(`Prompt with ulid ${system} not found`);
      }

      console.log('Found prompt:', prompt);
      system = prompt.task;
    }

    if (sanitizationFunctions[sanitizationLevel]) {
      message = sanitizationFunctions[sanitizationLevel](message);
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
