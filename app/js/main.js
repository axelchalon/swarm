'use strict';

if ( /mobile/i.test(navigator.userAgent)) {
  (function($) {
      $.fn.offsetOld = $.fn.offset;
      $.fn.offset = function() {
        var result = this.offsetOld();
        result.top -= window.scrollY;
        result.left -= window.scrollX;
        return result;
      };
  })(jQuery);
}

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
                clearTimeout(timeouts[uniqid]);
            timeouts[uniqid] = setTimeout(
                () => {
                    delete timeouts[uniqid]; // when checking for pending requests
                    fn()
                }, interval);
        }
    })(),
    setTimeoutUniqueRepeatUntil: function(fn, interval, uniqid) {
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
    SERVER_SEND_THROTTLE_INTERVAL: 500,
    initializeEvents: function() {
        var thisView = this;

				$('#bit-holder').on('mousedown','.bit__delete', function(e) {
						if ($(this).hasClass('no-internet'))
							return;

						// issue: app contient la logique serveur & la logique vue front
            App.clientDeletedBit({
                id: $(e.target).parent().data('id'),
								text: thisView.getPlaintextFrom$BitMessage($(e.target).siblings('.bit__text')),
								left: $(e.target).parent().css('left'),
								top: $(e.target).parent().css('top')
							})

						thisView.delete$Bit($(e.target).parent())
            return true;
				});

        $('#canvas').on('mousedown', function(e) {
						if ($(this).hasClass('no-internet'))
							return;

            if (e.target !== this)
                return;

            var relX = e.pageX
            var relY = e.pageY - 5;

            // Grid
            relX = Math.round(relX / thisView.GRID_X) * thisView.GRID_X
            relY = Math.round(relY / thisView.GRID_Y) * thisView.GRID_Y

            var id = Math.floor(Math.random() * 100000); // magic is happening
            thisView.appendBit({
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

				$('#bit-holder').on('focus', '.bit__text', (e) => {
					$(e.target).closest('.bit').css('z-index','1').addClass('focus')
				})

				$('#bit-holder').on('blur', '.bit__text', (e) => {
					$(e.target).closest('.bit').css('z-index','auto').removeClass('focus')
				})

        $('#bit-holder').on('input', '.bit__text', (e) => {
            // Doesn't matter if we put this inside the callforward
            var $bit_message = $(e.target);
            var $bit = $bit_message.closest('.bit')

            // purely client; so that the editTimeout refers to the same id after reception of tempIdisId
            var uniqid = $bit.data('tempid') || $bit.data('id');

            Utils.setTimeoutUniqueRepeatUntil(() => {
                if (typeof($bit.data('id')) === 'undefined')
                    return false

                App.clientEditedBit({
                    id: $bit.data('id'),
                    text: this.getPlaintextFrom$BitMessage($bit_message)
                });
            }, this.SERVER_SEND_THROTTLE_INTERVAL, 'edit#' + uniqid)

        });

        window.onbeforeunload = function() {
            if (App.notSaved())
                return 'Please wait a short while so we can save your message.';
            else
                return null;
        }
    },
    appendBit: function(bit, id, created_by_user) {
        var thisView = this;
        var $bit = $($('.template-bit').html()) // or children.clone
            .css({
                top: bit.top,
                left: bit.left
            })
            .find('.bit__text')
            .html(Utils.escapeAndNl2br(bit.text || ''))
            .end()
            .appendTo('#bit-holder')
            .draggable({
                handle: ".bit__handle",
                containment: "#canvas",
                drag: function(event, ui) {
                    var snapTolerance = $(this).draggable('option', 'snapTolerance');
                    var topRemainder = ui.position.top % thisView.GRID_Y;
                    var leftRemainder = ui.position.left % thisView.GRID_X;

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

                    Utils.setTimeoutUniqueRepeatUntil(() => {
                        if (typeof($bit.data('id')) === 'undefined')
                            return false
                        App.clientMovedBit({
                            id: $bit.data('id'),
                            left: ui.position.left,
                            top: ui.position.top
                        })
                    }, thisView.SERVER_SEND_THROTTLE_INTERVAL, 'move#' + uniqid)
                }
            });

        if (created_by_user) {
            $bit.find('.bit__text').focus();
            $bit.attr('data-tempid', id) // rather than .data() so that we can search for an id using CSS selectors
        } else
            $bit.attr('data-id', id) // rather than .data() so that we can search for an id using CSS selectors

        $bit.find('.bit__text').focusout(this.deleteIfEmpty).html(Utils.escapeAndNl2br(bit.text || ''));
    },
    removeAllBits: function() {
        $('#bit-holder .bit__text').remove();
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
			this.delete$Bit($('[data-id=' + bit.id + ']'));
    },
		delete$Bit: function($bit) {
			$bit.addClass('being-removed')
			setTimeout(() => {
				$bit.remove();
			}, 500)
		},
    tempIdIsId: function(temp_id, id) {
        $('[data-tempid=' + temp_id + ']').attr('data-id', id);
    },
    deleteIfEmpty: function(e) {
        if ($(this).text().length < 1) {
            $(this).siblings('.bit__delete').trigger('mousedown');
        }
    },
		getPlaintextFrom$BitMessage: function($bit_message) {
				var $el_with_linebreaks = $bit_message.clone().find("br").replaceWith("\n").end();
				var html_content = $el_with_linebreaks.html().replace(/<div>/g, "<div>\n");
				var plaintext = jQuery(document.createElement('div')).html(html_content).text();
				return plaintext;
		},
		setReadOnly: function(e) {
				$('.bit__text').removeAttr('contenteditable');
		}
}

// # VUE
var App = new Vue({
    el: '#app',
    data: {
        screen: 'loading', // 'loading' | 'active' | 'error'
        roomName: undefined,
        firstConnection: true,
				noInternet: false,
        flags: [],
        socket: undefined,
				cancelToastBit: {},
				showCancelToast: false,
				showCancelToastTimeout: -1,
    },
    methods: {
        initializeSocketEvents: function() {
            if (location.hostname == 'swarm.ovh')
                this.socket = io.connect('http://141.138.157.211:1336');
            else
                this.socket = io.connect('http://127.0.0.1:1336');

            this.socket.on('connect_error', (e) => {
								if (this.firstConnection) {
									debug('sockets')('Could not connect')
                	this.screen = 'error'
								}
								else if (!this.noInternet){
									debug('sockets')('Lost connection')
									this.noInternet = true;
									View.setReadOnly();
								}
            });

            this.socket.on('connect', () => {
                if (!this.firstConnection) {
										debug('sockets')('Reconnected')
                    this.socket.emit('swarm', this.roomName);
                    return;
                }
                this.firstConnection = false;
								debug('sockets')('Connected')

                // The following executed only once

                var [_, roomName, flagsString] = window.location.href.match(/\/([^/+*]*)([+*]*)$/)
                this.roomName = roomName;
                this.flags = flagsString.split('').reduce((acc, flagLetter) => {
                    var assoc = {
                        '+': 'plus',
                        '*': 'secret'
                    };
                    if (flagLetter in assoc) acc[assoc[flagLetter]] = true;
                    return acc;
                }, {});

								debug('logic')('Room', this.roomName)
								debug('logic')('Flags', this.flags)

                this.socket.emit('swarm', this.roomName);

                if ('secret' in this.flags) {
                    window.history.pushState({}, null, '/');
                } else if (this.roomName.length){
                    document.title = this.roomName + ' – SWARM';
                }
            });

            this.socket.on('catchUp', (bits) => {
                debug('sockets')('Catching up')
								this.noInternet = false;
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

            this.socket.on('tempIdIsId', (obj) => {
                View.tempIdIsId(obj.temp_id, obj.id);
            });

            this.socket.on('new', (bit) => {
                View.appendBit({
                    left: bit.left,
                    top: bit.top,
										text: bit.text || ''
                }, bit.id)
            });

            this.socket.on('move', function(updatedBit) {
                View.moveBit(updatedBit)
            });

            this.socket.on('delete', function(id) {
                View.deleteBit({
                    id: id
                });
            });

            this.socket.on('edit', function(bit) {
                View.editBit(bit);
            });
        },
        clientDeletedBit: function(bit) {
					if (bit.text) {
						this.cancelToastBit = Object.assign({},bit);
						this.showCancelToast = true;
						// this.showCancelToastTimeout = setTimeout(() => {
						//  	this.showCancelToast = false; }, 5000)
					}
          this.socket.emit('delete', bit.id);
        },
				onClickCancelToast: function() {
					this.showCancelToast = false;
					clearTimeout(this.showCancelToastTimeout);
					var id = Math.floor(Math.random() * 100000); // magic is happening
					View.appendBit({
							left: this.cancelToastBit.left,
							top: this.cancelToastBit.top,
							text: this.cancelToastBit.text
					}, id, true)
					this.clientCreatedBit(this.cancelToastBit)
				},
        clientCreatedBit: function(bit) {
            this.socket.emit('new', bit); //todo wait until edit ?
        },
        clientEditedBit: function(bit) {
            this.socket.emit('edit', {
                id: bit.id,
                text: bit.text
            });
        },
        clientMovedBit: function(bit) {
            this.socket.emit('move', {
                id: bit.id,
                left: bit.left,
                top: bit.top
            });
        },
        notSaved: function() {
            return Object.keys(Utils.setTimeoutUnique()).length > 0
        }
    }
})

App.initializeSocketEvents();
View.initializeEvents();
