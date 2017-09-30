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
        bit.id = bit.bit_client_id;
        this.socket.emit('new', bit); //todo wait until edit ?
    })

    events.client.bit_moved
    .flatMapLatest(bit => { // todo DRY ==> .waitForServerId()
        if (!bit.bit_server_id) {
            var assocStream = events.server.bit_temp_id_is_id.filter(obj => obj.temp_id == bit.bit_client_id).map('.id');
            return Bacon.constant(bit).combine(assocStream,(bit,bit_server_id) => Object.assign({}, bit, {bit_server_id}))
        } else {
            return Bacon.constant(bit);
        }
    })
    .onValue(bit => {
        ds('Sending move to server', bit);
        this.socket.emit('move', {
            id: bit.bit_server_id,
            left: bit.left,
            top: bit.top
        });
    })

    // todo check workflow
    var client_edited_bit_throttled = events.client.bit_edited.throttle(500);
    var client_edited_bit_throttled_with_server_id_known_streams = client_edited_bit_throttled.filter(bit => bit.bit_server_id).map(bit => Bacon.constant(bit).first()).doAction(t => dv('Client bit edit throttled with known server id')); // Bacon.once(bit)
    var client_edited_bit_throttled_with_server_id_unknown_streams = client_edited_bit_throttled
        .filter(b => !b.bit_server_id)
        .map(bit => {
            var assocStream = events.server.bit_temp_id_is_id.filter(obj => obj.temp_id == bit.bit_client_id).map('.id');
            return Bacon.constant(bit).combine(assocStream,(bit,bit_server_id) => Object.assign({}, bit, {bit_server_id})).first();
        })
        .doAction(t => dv('Client bit edit throttled with unknown server id'));
    
    var starts = client_edited_bit_throttled_with_server_id_unknown_streams.map(stream => 'start').doAction(t => dv('Unknown server ID for client edited bit: started waiting...'));
    var ends = client_edited_bit_throttled_with_server_id_unknown_streams.flatMap(stream => stream.mapEnd('end').filter('end').first()).doAction(t => dv('Unknown server ID for client edited bit: finished waiting...'));

    var starts_count = starts.map(1).scan(0, (x,y) => x + y).doAction(t => dv('Requests count',t));
    var ends_count = ends.map(1).scan(0, (x,y) => x + y).doAction(t => dv('Responses count',t));

    events.server.loading = ends_count.combine(starts_count, (ends_count, starts_count) => ends_count !== starts_count).doAction(t => dv('Loading ?',t))
    events.server.client_edited_bit_sent = 
        client_edited_bit_throttled_with_server_id_known_streams
        .merge(client_edited_bit_throttled_with_server_id_unknown_streams).flatMapLatest(a => a).doAction(t => ds('Edited bit sent',t)) // @todo notsure about this one
        // ^todo this logging is confusing "edited bit sent"; "sending bit edit to server"
    events.server.loading.onValue(() => 1);

    // var start_loading = events.server.client_edited_bit_with_server_id_unknown;

    // end_loading = events.server.client_edited_bit_with_server_id_unknown.flatMap(stream => stream.mapEnd('end').filter('end').first())
    // var loading = events.server.client_edited_bit_with_server_id_unknown.map(true).merge(... .map(false))
    
    // ==> utiliser le nombre d'évènements. zipWith!
    // var loading = ends_count.combine(starts_count, (ends_count, starts_count) => ends_count == starts_count)

    // .. pageLoad.merge(beforeChange)
    

    // loading.delay(200).and(loading)

    
    // events.server.end_loading = client_edited_bit_sent_pre.scan((acc, cur) => ).doAction(v => ds('End loading.'))
    // pas besoin : events.server.loading = // true | false
    

    // & user reduce (check if all complete)

    // et add +10ms pour pas que bacon.constant affiche "loading" et ensuite "not loading"
    // (s'assurer l'ordre)

    events.server.client_edited_bit_sent.onValue(bit => {
        ds('Sending edit to server', bit);
        this.socket.emit('edit', {
            id: bit.bit_server_id,
            text: bit.text
        });
    })

    // moved bit: make sure that is has server_id
    // use middleware throttler, the same everywhere! go
    // possible de merge aussi "new (sans server id) + move + server id => new (server id, nouvelles positions)"
};

