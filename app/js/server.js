/*

var Config = {
    OT_ENABLED: true,
    SERVER_SEND_THROTTLE_INTERVAL: 500
};
(or in config)
*/

// @TODO NAMESPACE {} et expose only events

// hello server.js (the node server is also called server.js, hmm)

// global.server
// var debug = global.debug('sockets')
// var io = global.io;

// Server.Events ou Events.Server ?
// dépend si on a accès à d'autres trucs de server ou non
// donc sûrement Events.Server

var d = debug('events-server');
var socket;

if (location.hostname == 'swarm.ovh' || 1)
    socket = io.connect('https://dashpad.me:1336');
else
    socket = io.connect('http://127.0.0.1:1336');

events.server.connected = Bacon.fromEvent(socket, 'connect').doAction(() => d('[Connected]'));
events.server.connected.combine(events.client.pad, (c,pad) => ({c, pad: pad.pad})).onValue(({c,pad}) => {
    d('[Emitting] Emitting \'swarm\' event');
    socket.emit('swarm', pad);
});

events.server.disconnected = Bacon.fromEvent(socket, 'connect_error').doAction(() => d('[Disconnected]'));
events.server.connected_users_count = Bacon.fromEvent(socket, 'connectedUsersCount').toProperty().doAction((c) => d('[Received] User count: ', c));
events.server.bits_dump = Bacon.fromEvent(socket, 'catchUp').doAction(u => d('[Received] Caught up',u));
events.server.bit_temp_id_is_id = Bacon.fromEvent(socket, 'tempIdIsId').doAction(x => d('[Received] Temp ID is ID',x));
events.server.bit_new = Bacon.fromEvent(socket, 'new').doAction(b => d('[Received] New bit', b));
events.server.bit_move = Bacon.fromEvent(socket, 'move').doAction(b => d('[Received] Bit was moved', b));
events.server.bit_delete = Bacon.fromEvent(socket, 'delete').doAction(b => d('[Received] Bit was deleted', b));
events.server.bit_edit = Bacon.fromEvent(socket, 'edit').doAction(b => d('[Received] Bit was edited', b));

