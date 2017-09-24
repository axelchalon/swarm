var events = {server: {}, client: {}};

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
