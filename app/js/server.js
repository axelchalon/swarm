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

var ds = debug('events-server');
var socket;

if (location.hostname == 'swarm.ovh' || 1)
    socket = io.connect('https://dashpad.me:1336');
else
    socket = io.connect('http://127.0.0.1:1336');

events.server.connected = Bacon.fromEvent(socket, 'connect').doAction(() => ds('[Connected]'));
events.server.connected.combine(events.client.pad, (c,pad) => ({c, pad: pad.pad})).onValue(({c,pad}) => {
    ds('[Emitting] Emitting \'swarm\' event');
    socket.emit('swarm', pad);
});

events.server.disconnected = Bacon.fromEvent(socket, 'connect_error').doAction(() => ds('[Disconnected]'));
events.server.connected_users_count = Bacon.fromEvent(socket, 'connectedUsersCount').toProperty().doAction((c) => ds('[Received] User count: ', c));
events.server.bits_dump = Bacon.fromEvent(socket, 'catchUp').doAction(u => ds('[Received] Caught up',u));
events.server.bit_temp_id_is_id = Bacon.fromEvent(socket, 'tempIdIsId').doAction(x => ds('[Received] Temp ID is ID',x));
events.server.bit_created = Bacon.fromEvent(socket, 'new').doAction(b => ds('[Received] New bit', b));
events.server.bit_moved = Bacon.fromEvent(socket, 'move').doAction(b => ds('[Received] Bit was moved', b));
events.server.bit_deleted = Bacon.fromEvent(socket, 'delete').doAction(b => ds('[Received] Bit was deleted', b));
events.server.bit_edited = Bacon.fromEvent(socket, 'edit').doAction(b => ds('[Received] Bit was edited', b));

// Subscriptions to client
var callAfterView = () => {
    events.client.bit_deleted.onValue(bit => {
        ds('[Emitting] Client deleted bit; emitting \'delete\' event');
        this.socket.emit('delete', bit.bit_server_id);
    })
    
    events.client.bit_created.onValue(bit => {
        this.socket.emit('new', bit); //todo wait until edit ?
    })

    events.server.client_edited_bit_sent = events.client.bit_edited.throttle(500)
    .flatMapLatest(bit => { // why latest
        if (!bit.bit_server_id) {
            var assocStream = events.server.bit_temp_id_is_id.filter(obj => obj.temp_id == bit.bit_client_id).map('.id');
            return Bacon.constant(bit).combine(assocStream,(bit,obj) => Object.assign({}, bit, {bit_server_id: obj.id}))
        } else {
            return Bacon.constant(bit);
        }
    })
    .doAction(bit => {
        ds('Sending edit to server')
        this.socket.emit('edit', {
            id: bit.bit_server_id,
            text: bit.text
        });
    })
};

