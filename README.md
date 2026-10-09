# Is This Really Pastor?

A web app church members use to check whether a text or email really came from their pastor or church staff.

## What's in here

- `server.js` web server, pages, login, and the check API
- `check.js` the scam check: code rules first, then Claude explains it in plain words. The code has the final say, and there is no "safe" verdict.
- `views.js` the HTML pages
- `db.js` SQLite database (Node's built-in sqlite)
- `public/` styles and the member page script
- `test/run-tests.js` sample scam messages (`npm test`)

## Run it locally

    npm install
    npm start            # http://localhost:3000, demo church at /c/demo

## Railway settings

- Start command: `npm start` (Railway detects it)
- Volume mounted at `/data`
- Variables:
  - `ANTHROPIC_API_KEY` your Anthropic key (set in Railway, never in code)
  - `DATA_DIR=/data`
  - `NODE_ENV=production`
  - optional `PUBLIC_URL` once you have your own domain, e.g. `https://isthisreallypastor.com`
  - optional `ANTHROPIC_WORKSPACE_ID` (starts with `wrkspc_`), only needed if the API key isn't tied to a workspace
  - optional `ANTHROPIC_MODEL` to change the AI model (default `claude-haiku-5-5`)

Without an API key the app still works using the code rules alone.
