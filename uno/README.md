# UNO Rooms
Two to six players, room codes, no accounts. Game state lives in Netlify Blobs; clients poll every 1.5s.

## Deploy (needs npm install at build time, so NOT drag-and-drop)
Option A - Git: push this folder to GitHub, then Netlify > Add new site > Import from Git (defaults are fine).
Option B - CLI: `npm i -g netlify-cli && npm install && netlify deploy --prod`

## Play
Open the site, enter a name, Create room, share the 4-letter code. Friends Join with the code. Host presses Start.
Rules: match color or value. Skip, Reverse, +2, Wild, Wild +4 work as usual. Can't play? Draw one card (ends your turn).
