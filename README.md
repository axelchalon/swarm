Swarm is a public online whiteboard. See it in action at http://swarm.ovh

# TODO
See "issues" on GitHub.

# Installation
## Start the server
- cd server
- npm install
- npm start

## Compile the client files
- cd client
- npm install
- PATH=$(npm bin):$PATH brunch build (or, if you're developing, "watch" instead of "build")
- npm insall -g watchify
- watchify app/js/app.js -o app/js/app.min.js

# Contributing
Pull requests are welcome! Feel free to contribute! 