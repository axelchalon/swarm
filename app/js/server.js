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
    events.client.bit_deleted.flatMap(hydrateWithServerId).onValue(bit => {
        ds('[Emitting] Client deleted bit; emitting \'delete\' event');
        this.socket.emit('delete', bit.bit_server_id);
    })
    
    events.client.bit_created.onValue(bit => {
        // setTimeout(() => {
        bit.id = bit.bit_client_id;
        // console.log('(sending new)');
        this.socket.emit('new', bit); //todo wait until edit ?
        // },3000);
    })

    var SERVER_SEND_THROTTLE_INTERVAL = 2500;

    let hydrateWithServerId = bit => {
        if (bit.bit_server_id) {
            return Bacon.once(bit);
        } else {
            var assocStream = events.server.bit_temp_id_is_id.filter(obj => obj.temp_id == bit.bit_client_id).map('.id');
            return Bacon.constant(bit).combine(assocStream,(bit, bit_server_id) => Object.assign({}, bit, {bit_server_id})).first();
        }
    }

    events.server.bit_moved_sent = events.client.bit_moved.flatMap(hydrateWithServerId);
    events.server.bit_moved_sent.onValue(bit => {
        ds('Sending move to server', bit);
        this.socket.emit('move', {
            id: bit.bit_server_id,
            left: bit.left,
            top: bit.top
        });
    })

    events.server.bit_edit_sent = events.client.bit_edited.throttle(SERVER_SEND_THROTTLE_INTERVAL).flatMap(hydrateWithServerId);
    // events.client.bit_edited.flatMap(bit => Bacon.once("x").awaiting(events.server.bit_edit_sent.filter(obj => obj.bit_server_id == bit.bit_server_id)))
    // {bit: {}, loading: true} {bit: {}, loading: false}

    events.server.bit_edit_sent.onValue(bit => {
        ds('Sending edit to server', bit);
        this.socket.emit('edit', {
            id: bit.bit_server_id,
            text: bit.text
        });
    })

    events.server.requests_pending = Bacon.mergeAll(
            events.client.bit_edited.map(ev => ({stream: 'BIT_EDITED', event: ev})),
            events.server.bit_temp_id_is_id.map(ev => ({stream: 'BIT_TEMP_ID_IS_ID', event: ev})),
            events.server.bit_edit_sent.map(ev => ({stream: 'BIT_EDIT_SENT', event: ev}))
        )
        .scan(
            new Set(),
            (set, ev) => {
                if (ev.stream == 'BIT_EDITED') {
                    ev = ev.event;
                    if (ev.bit_server_id)
                        set.add(`BIT_SERVER_ID ${ev.bit_server_id}`)
                    else
                        set.add(`BIT_CLIENT_ID ${ev.bit_client_id}`)
                    return set;
                } else if (ev.stream == 'BIT_TEMP_ID_IS_ID') {
                    ev = ev.event;
                    var new_set = new Set(set);
                    set.forEach(v => {
                        if (v == `BIT_CLIENT_ID ${ev.temp_id}`) {
                            new_set.delete(v);
                            new_set.add(`BIT_SERVER_ID ${ev.id}`);
                        }
                    });
                    return new_set;
                } else if (ev.stream == 'BIT_EDIT_SENT') {
                    ev = ev.event;
                    var new_set = new Set(set);
                    set.forEach(v => {
                        if (v == `BIT_SERVER_ID ${ev.bit_server_id}`) {
                            new_set.delete(v);
                        }
                    });
                    return new_set;
                }
                else {
                    console.error('?',ev);
                }
        })
        .skipDuplicates()
        .doAction(x => ds('Set of update requests not yet sent:', x)).map(set => set.size > 0).skipDuplicates();

    events.server.requests_pending.onValue(x => ds('Requests pending?', x))
    /*


    events.client.bit_edited.flatMap(bit => events.client.bit_edited.filter(sameBitId).last().awaiting(events.server.bit_edit_sent.filter(sameBitId).map(bool => {bit: bit, loading: bool})))
    // loading c'est : 
    à chaque fois qu'il y a un client.bit_edit, loading: true
    à chaque fois qu'il y a un bit_edit_sent ====> read on up on baconjs properties !

    je peux utiliser Bacon.end pour chaque... 
    un stream qui émet des streams qui peuvent end
    et scan(stream is finished) ?

{je peux utiliser events.client.bit_edited.flatMAp(hydrateWithServerId) ?}

  (edit bit 3)  (edit bit 3)     (edit bit 3 sent)
       v              v                 v


  (edit bit cid 3)  (edit bit cid sid 5)         (edit bit sid 3 sent)
       v                     v                             v <== comment faire pour que ça annule [edit bit cid 3] et [edit bit sid 5] ?
            ^
     clientIdIsServerId
           3,4

cid ça veut dire que c'est moi qui ai créé le bit


// OK LE FOLLOWING EST TOP mais
// woops comment je fais pour comparer deux bits ? par ex si awaiting...
    events.server.loading = Bacon.combineAsArray(events.client.bit_edited, events.server.bit_edit_sent)

       loading=
    fold sur [combine EditBit et EditBitSent] avec seed []
    - quand je tombe sur un edit bit 3, j'add 3 à l'array. [3]
    - quand je tombe sur un edit bit 3 sent, je remove l'élément 3 de l'array. []
    - .map(x => x.length)

    events.client.bit_edited.reduce(false, )







    et il y aura aussi move par exemple ; ce sera pareil
    events.server.loading = Bacon.mergeAll(
        [
            ? any ?
        ]
    )

    et debounce le loading pour l'affichage... (si loading a pris cette valeur pendant plus de X secondes)

    */

    // todo check workflow
    
    /*
    old version
    var client_edited_bit_throttled = events.client.bit_edited.throttle(SERVER_SEND_THROTTLE_INTERVAL);
    var client_edited_bit_throttled_with_server_id_known_streams = client_edited_bit_throttled.filter(bit => bit.bit_server_id).map(bit => Bacon.constant(bit).first()).doAction(t => ds('Client bit edit throttled with known server id')); // Bacon.once(bit)
    var client_edited_bit_throttled_with_server_id_unknown_streams = client_edited_bit_throttled
        .filter(b => !b.bit_server_id)
        .map(bit => {
            var assocStream = events.server.bit_temp_id_is_id.filter(obj => obj.temp_id == bit.bit_client_id).map('.id');
            return Bacon.constant(bit).combine(assocStream,(bit,bit_server_id) => Object.assign({}, bit, {bit_server_id})).first();
        }) // todo I should merge known and unknown streams into on (like it as before) and then I can simply do, for client bit edit, move, delete: .map(hydrateWithServerId)
        .doAction(t => ds('Client bit edit throttled with unknown server id'));
    
    // should not be based on throttled edit but on real edit
    var starts = client_edited_bit_throttled_with_server_id_unknown_streams.map(stream => 'start').doAction(t => ds('Unknown server ID for client edited bit: started waiting...'));
    var ends = client_edited_bit_throttled_with_server_id_unknown_streams.flatMap(stream => stream.mapEnd('end').filter('end').first()).doAction(t => ds('Unknown server ID for client edited bit: finished waiting...'));

    var starts_count = starts.map(1).scan(0, (x,y) => x + y).doAction(t => ds('Requests count',t));
    var ends_count = ends.map(1).scan(0, (x,y) => x + y).doAction(t => ds('Responses count',t));

    events.server.loading = ends_count.combine(starts_count, (ends_count, starts_count) => ends_count !== starts_count).doAction(t => ds('Loading ?',t))
    events.server.client_edited_bit_sent = 
        client_edited_bit_throttled_with_server_id_known_streams
        .merge(client_edited_bit_throttled_with_server_id_unknown_streams).flatMapLatest(a => a).doAction(t => ds('Edited bit sent',t)) // @todo notsure about this one
        // ^todo this logging is confusing "edited bit sent"; "sending bit edit to server"
    events.server.loading.onValue(() => 1);

    events.server.client_edited_bit_sent.onValue(bit => {
        ds('Sending edit to server', bit);
        this.socket.emit('edit', {
            id: bit.bit_server_id,
            text: bit.text
        });
    })
    */


    // je peux utiliser .zip à la place
    // "observable.awaiting(otherObservable) creates a Property that indicates whether observable is awaiting otherObservable, i.e. has produced a value after the latest value from otherObservable."
    // si sent_requests.awaiting(received_requests) alors loading

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


    // moved bit: make sure that is has server_id
    // use middleware throttler, the same everywhere! go
    // possible de merge aussi "new (sans server id) + move + server id => new (server id, nouvelles positions)"
};

