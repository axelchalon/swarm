var events = {server: {}, client: {}, view: {}}; // <-- @todo freeze ; ne pas permettre de réassigner quand on a assigné une fois

// # EVENTS
// todo stream roomname pour pouvoir changer de room ez-li
var [_, room_name, flags_string] = window.location.href.match(/\/([^/+*]*)([+*]*)$/)
var flags = flags_string.split('').reduce((acc, flagLetter) => {
    var assoc = {
        '+': 'plus',
        '*': 'secret' // todo enum
    };
    if (flagLetter in assoc) acc[assoc[flagLetter]] = true;
    return acc;
}, {});
events.client.pad = Bacon.constant({pad: room_name, flags: flags});

if (location.hostname == 'swarm.ovh' || 1)
    var SOCKET_ENDPOINT = 'https://dashpad.me:1336';
else
    var SOCKET_ENDPOINT = 'http://127.0.0.1:1336';