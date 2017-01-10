'use strict';

// # UTILS
var Utils = {
    escapeAndNl2br: function(text) {
        var htmls = [];
        var lines = text.split(/\n/);
        var tmpDiv = jQuery(document.createElement('div'));
        for (var i = 0; i < lines.length; i++) {
            htmls.push(tmpDiv.text(lines[i]).html());
        }
        return htmls.join("<br>");
    },
    setTimeoutUnique: (function() {
        var timeouts = {};
        return function(fn, interval, uniqid) {
						if (!arguments.length) return timeouts; // lol
            if (uniqid in timeouts)
                clearTimeout(timeouts[uniqid])
            timeouts[uniqid] = setTimeout(fn, interval)
        }
    })(),
    setTimeoutUniqueRepeatUntil: (fn, interval, uniqid) => {
        var fn_ = () => {
            if (fn() === false)
                this.setTimeoutUnique(fn_, interval, uniqid)
        }
        this.setTimeoutUnique(fn_, interval, uniqid)
    }
};

// # VIEW UTILS (needs UTILS)
var View = {
    GRID_X: 10,
    GRID_Y: 10,
    SERVER_SEND_THROTTLE_INTERVAL: 3000,
    initializeEvents: function() {
        $('#canvas').on('mousedown', (e) => {
            if ($(e.target).is('.bit__delete')) {
                App.clientDeletedBit({
                    id: $(e.target).parent().data('id')
                })
                $(e.target).parent().remove();
                return true;
            }

            if (e.target !== this)
                return;

            var parentOffset = $(this).offset();
            var relX = e.pageX - parentOffset.left;
            var relY = e.pageY - parentOffset.top - 5;

            // Grid
            relX = Math.round(relX / this.GRID_X) * this.GRID_Xs
            relY = Math.round(relY / this.GRID_Y) * this.GRID_Y

            var id = Math.floor(Math.random() * 100000); // magic is happening
            this.appendBit({
                left: relX,
                top: relY
            }, id, true);

            // @todo callback with the DOM element to assign the id without tempId ?
            // App.clientCreatedBit(bit, function(id) { thisElement.data('id',id) })
            // app socket handling needs to be request/response style
            // but what about handling of the client bit without id before this?

            App.clientCreatedBit({
                id: id,
                top: relY,
                left: relX
            });
            return false;
        });

        $('#canvas').on('input', '.bit__text', (e) => {
            // Doesn't matter if we put this inside the callforward
            var $bit_message = $(e.target);
            var $bit = $bit_message.closest('.bit')

            // purely client; so that the editTimeout refers to the same id after reception of tempIdisId
            var uniqid = $bit.data('tempid') || $bit.data('id');

            setTimeoutUniqueRepeatUntil(() => {
                if (typeof($bit.data('id')) === 'undefined')
                    return false
                var $el_with_linebreaks = $bit_message.clone().find("br").replaceWith("\n").end();
                var html_content = $el_with_linebreaks.html().replace(/<div>/g, "<div>\n");
                var plaintext = jQuery(document.createElement('div')).html(html_content).text();
                App.clientEditedBit({
                    id: $bit.data('id'),
                    text: plaintext
                });
            }, this.SERVER_SEND_THROTTLE_INTERVAL, 'edit' + uniqid)

        });

        window.onbeforeunload = function() {
            if (App.notSaved())
                return 'Please wait a short while so we can save your message.';
            else
                return null;
        }
    },
    appendBit: function(bit, id, created_by_user) {
        var $bit = $($('.template-bit').html()) // or children.clone
            .css({
                top: bit.top,
                left: bit.left
            })
            .find('.bit__text')
            .html(Utils.escapeAndNl2br(bit.text || ''))
            .end()
            .appendTo('#canvas')
            .draggable({
                handle: ".bit__handle",
                containment: "parent",
                drag: function(event, ui) {
                    var snapTolerance = $(this).draggable('option', 'snapTolerance');
                    var topRemainder = ui.position.top % this.GRID_Y;
                    var leftRemainder = ui.position.left % this.GRID_X;

                    if (topRemainder <= snapTolerance) {
                        ui.position.top = ui.position.top - topRemainder;
                    }

                    if (leftRemainder <= snapTolerance) {
                        ui.position.left = ui.position.left - leftRemainder;
                    }
                },
                start: function(e) {
                    $(this).addClass('being-dragged');
                },
                stop: function(e, ui) {
                    $(this).removeClass('being-dragged');
                    var $bit = $(this)

                    // purely client; so that the editTimeout refers to the same id after reception of tempIdisId
                    var uniqid = $bit.data('tempid') || $bit.data('id');

                    setTimeoutUniqueRepeatUntil(() => {
                        if (typeof($bit.data('id')) === 'undefined')
                            return false
                        App.clientMovedBit({
                            id: $bit.data('id'),
                            left: ui.position.left,
                            top: ui.position.top
                        })
                    }, this.SERVER_SEND_THROTTLE_INTERVAL, 'move' + uniqid)
                }
            });

        if (created_by_user) {
            $bit.find('.bit__text').focus();
            $bit.attr('data-tempid', id) // rather than .data() so that we can search for an id using CSS selectors
        } else
            $bit.attr('data-id', id) // rather than .data() so that we can search for an id using CSS selectors

        $bit.find('.bit__text').focusout(this.deleteIfEmpty);
    },
    removeAllBits: function() {
        $('#canvas .bit__text').remove();
    },
    editBit: function(bit) {
        $('[data-id=' + bit.id + '] .bit__text').html(Utils.escapeAndNl2br(bit.text));
    },
    moveBit: function(bit) {
        $('[data-id=' + bit.id + ']').css({
            top: bit.top,
            left: bit.left
        });
    },
    deleteBit: function(bit) {
        $('[data-id=' + bit.id + ']').remove();
    },
    tempIdIsId: function(temp_id, id) {
        $('[data-tempid=' + temp_id + ']').attr('data-id', id);
    },
    deleteIfEmpty: function(e) {
        if ($(this).text().length < 1) {
            $(this).siblings('.bit__delete').trigger('mousedown');
        }
    }
}

// # VUE
var App = new Vue({
    el: '#app',
    data: {
        screen: 'loading', // 'loading' | 'active' | 'error'
        roomName: undefined,
        firstConnection: true,
        flags: []
    },
    methods: {
        initializeSocketEvents: function() {
            if (location.hostname == 'swarm.ovh')
                var socket = io.connect('http://141.138.157.211:1336');
            else
                var socket = io.connect('http://127.0.0.1:1336');

            socket.on('connect_error', (e) => {
                this.screen = 'error'
            });

            socket.on('connect', () => {
                console.log('CONNECT')
                if (!this.firstConnection) {
                    socket.emit('swarm', this.roomName);
                    return;
                }
                this.firstConnection = false;

                // The following executed only once

                console.log('CONNECT :: firstTime')
                var [_, roomName, flagsString] = window.location.href.match(/\/([^/+*]*)([+*]*)$/)
                this.roomName = roomName;
                this.flags = flagsString.split('').reduce((acc, flagLetter) => {
                    var assoc = {
                        '+': 'plus',
                        '*': 'secret'
                    };
                    if (flagLetter in assoc) acc.push(assoc[flagLetter]);
                    return acc;
                }, []);
                console.log('flags : ', this.flags)
                console.log('roomName : ', this.roomName)

                socket.emit('swarm', this.roomName);

                if ('secret' in this.flags) {
                    window.history.pushState({}, null, '/');
                } else {
                    document.title = this.roomName + ' – SWARM';
                }
            });

            socket.on('catchUp', (bits) => {
                console.log('CATCH UP');
                View.removeAllBits(); // @todo View.setBits({}) & standardize bit object : {id: ...}
                $.each(bits, function(i, bit) {
                    View.appendBit({
                        left: bit.left,
                        top: bit.top,
                        text: bit.text
                    }, bit.id)
                });
                this.screen = 'active'
            });

            // @todo encodage

            socket.on('tempIdIsId', (obj) => {
                View.tempIdIsId(obj.temp_id, obj.id);
            });

            socket.on('new', (bit) => {
                View.appendBit({
                    left: bit.left,
                    top: bit.top
                }, bit.id)
            });

            socket.on('move', function(updatedBit) {
                View.moveBit(updatedBit)
            });

            socket.on('delete', function(id) {
                View.deleteBit({
                    id: id
                });
            });

            socket.on('edit', function(bit) {
                View.editBit(bit);
            });
        },
        clientDeletedBit: function(bit) {
            socket.emit('delete', bit.id);
        },
        clientCreatedBit: function(bit) {
            socket.emit('new', bit); //todo wait until edit ?
        },
        clientEditedBit: function(bit) {
            socket.emit('edit', {
                id: bit.id,
                text: bit.text
            });
            delete editTimeouts[id];
        },
        clientMovedBit: function(bit) {
            socket.emit('move', {
                id: bit.id,
                left: bit.left,
                top: bit.top
            });
        },
        notSaved: function() {
            return Object.keys(Utils.setTimeoutUniue()).length > 0 // @todo editTimeouts!?
        }
    }
})

App.initializeSocketEvents();
View.initializeEvents();
