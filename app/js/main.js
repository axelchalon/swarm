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

var Config = {
    OT_ENABLED: true,
    SERVER_SEND_THROTTLE_INTERVAL: 500
};

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
    escape: function(text) {
        var tmpDiv = jQuery(document.createElement('div'));
        return tmpDiv.text(text).html();
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
    },
    getOt: function(from,to) {
        var dmp = new diff_match_patch();
        var steps = dmp.diff_main(from,to);
        var ot_steps = [];
            
        var n = 0;
        for (var i = 0; i<steps.length; i++) {
            switch (steps[i][0]) {
                case DIFF_EQUAL:
                    n += steps[i][1].length;
                    break;
                case DIFF_INSERT:
                    ot_steps.push([n,"insert",steps[i][1]]);
                    n += steps[i][1].length;
                    break;
                case DIFF_DELETE:
                    ot_steps.push([n,"remove",steps[i][1].length]);
                    break;
            }
        }
        
        return ot_steps;        
    }
};

// # VIEW UTILS (needs UTILS)
var View = {
    GRID_X: 10,
    GRID_Y: 14,
    get$BitsAdjacentTo$Bit: function($bit,actualHeight) { // get bits to the left, right and bottom

      var refTop = parseInt($bit[0].style.top);
      var refLeft = parseInt($bit[0].style.left);
      var refBottom = refTop + (actualHeight || $bit.height());
      var refRight = refLeft + $bit.width();

      var adjacent$Bits = [];
      var thisView = this;
      $('.bit').each(function() {

        if ($(this).is($bit)) return;

        var top = parseInt($(this)[0].style.top);
        var left = parseInt($(this)[0].style.left);
        var bottom = top + $(this).height();
        var right = left + $(this).width();

        if (bottom == top) return; // null height

        var boundaries = [
          {y: [refBottom,refBottom+4*thisView.GRID_Y], x: [refLeft-4*thisView.GRID_X,refLeft+4*thisView.GRID_X]}, // down
          // {y: [refTop,refBottom], x: [refLeft-4*thisView.GRID_X-$(this).width(),refLeft]}, // left
          // {y: [refTop,refBottom], x: [refRight,refRight+4*thisView.GRID_X]} // right
        ];

        var bitIsInBoundary = (boundary) =>
              top >= boundary.y[0] && top <= boundary.y[1] &&
              left >= boundary.x[0] && left <= boundary.x[1]
        if (boundaries.some(bitIsInBoundary))
          adjacent$Bits.push($(this)); // {id: $(this).attr('data-id')})
      });

      var result =
        adjacent$Bits.concat(
        adjacent$Bits.map(this.get$BitsAdjacentTo$Bit.bind(this)).reduce((acc, cur) => acc.concat(cur), [])
        )
      .filter((v, i, a) => a.indexOf(v) === i); // uniquify

      return result;
    },
    initializeEvents: function() {
        var thisView = this;

        $('#bit-holder').on('mousedown', '.bit__delete', function(e) {
            // issue: app contient la logique serveur & la logique vue front
            App.clientDeletedBit({
                id: $(e.target).parent().data('id'),
                text: thisView.getPlaintextFrom$BitMessage($(e.target).siblings('.bit__text')),
                left: $(e.target).parent().css('left'),
                top: $(e.target).parent().css('top')
              })

            thisView.delete$Bit($(e.target).parent())
            return true;
        })

        $('#canvas').on('mousedown', function(e) {
						if ($(this).hasClass('no-internet'))
							return;

            if (e.target !== this)
                return;

            var parentOffset = $(this).offset();
            var relX = e.pageX - parentOffset.left;
            var relY = e.pageY // - parentOffset.top - 5;

            relY -= 35; // top margin

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
          cascadeMemory.$bit = $(e.target).closest('.bit');
          cascadeMemory.height = $(e.target).closest('.bit').height();
					$(e.target).closest('.bit').css('z-index','1').addClass('focus')
				})

				$('#bit-holder').on('blur', '.bit__text', (e) => {
					$(e.target).closest('.bit').css('z-index','').removeClass('focus')
				})

        var cascadeMemory = {$bit: $(''), initialHeight: 0}

        // Prevent from pasting formatted text
        $('#bit-holder').on('paste', '.bit__text', ($e) => {
          var e = $e.originalEvent;
          var text = "";
          if (e.clipboardData && e.clipboardData.getData) {
            text = e.clipboardData.getData("text/plain");
          } else if (window.clipboardData && window.clipboardData.getData) {
            text = window.clipboardData.getData("Text");
          }
          text = text.replace(/\n/g,"<br>");
          e.preventDefault();
          document.execCommand("insertHTML" , false, text);
        });

        $('#bit-holder').on('keyup', '.bit__text', (e) => {
          var $bit = $(e.target).closest('.bit');
          if (cascadeMemory.$bit.is($bit) // security check
            && cascadeMemory.height != $bit.height()) {
              var difference = $bit.height() - cascadeMemory.height;
              var oldHeight = cascadeMemory.height;
              cascadeMemory.height = $bit.height()
              debug('cascade')('Detected change in bit height',difference)
              this.get$BitsAdjacentTo$Bit($(e.target).closest('.bit'),oldHeight).forEach(function($el) {
                var newY = parseInt($el[0].style.top)+difference;
                $el.css('top', newY + 'px');
                App.clientMovedBit({
                  id: $el.attr('data-id'),
                  top: newY,
                  left: $el[0].style.left
                })
              })
            }
        });

        $(document).on('keydown', (e) => {
          if (e.altKey && e.keyCode >= 37 && e.keyCode <= 40) {

            var $bit = $(e.target).is('.bit__text') && $(e.target).closest('.bit');
            if ($bit && $bit.attr('data-id')) {
              var newX = parseInt($bit[0].style.left);
              var newY = parseInt($bit[0].style.top);

              if (e.keyCode == 37) // left
                newX -= this.GRID_X;
              else if (e.keyCode == 38) // up
                newY -= this.GRID_Y;
              else if (e.keyCode == 39) // right
                newX += this.GRID_X;
              else if (e.keyCode == 40) // down
                newY += this.GRID_Y;

              $bit.css('left', newX + 'px');
              $bit.css('top', newY + 'px');
              App.clientMovedBit({
                id: $bit.attr('data-id'),
                top: newY,
                left: newX
              })
            }

            // possible de call cascade
            e.preventDefault();
          }
        });

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
                $('[data-id=' + $bit.data('id') + ']').data('shared',this.getPlaintextFrom$BitMessage($bit_message));
            }, Config.SERVER_SEND_THROTTLE_INTERVAL, 'edit#' + uniqid)

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
        var $bit = $(!window.chrome ? $('.template-bit-nonchrome').html() : $('.template-bit-chrome').html()) // or children.clone
            .css({
                top: bit.top,
                left: bit.left
            })
            .find('.bit__text')
            //.html(Utils.escape(bit.text || ''))
            .text(bit.text)
            .end()
            .data('shared',bit.text)
            .appendTo('#bit-holder')
            .draggable({
                handle: ".bit__handle",
                // containment: "#canvas",
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

                    if (ui.position.left < snapTolerance/2)
                      ui.position.left = snapTolerance/2;

                    if (ui.position.left + $(this).width() + snapTolerance/2 > 1024)
                      ui.position.left = 1024 - $(this).width() - snapTolerance/2;

                    if (ui.position.top < 0)
                      ui.position.top = 0;
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
                    }, Config.SERVER_SEND_THROTTLE_INTERVAL, 'move#' + uniqid)
                }
            });

        if (created_by_user) {
            $bit.find('.bit__text').focus();
            $bit.attr('data-tempid', id) // rather than .data() so that we can search for an id using CSS selectors
        } else
            $bit.attr('data-id', id) // rather than .data() so that we can search for an id using CSS selectors

        $bit.find('.bit__text').focusout(this.deleteIfEmpty)
    },
    removeAllBits: function() {
        $('#bit-holder .bit__text').remove();
    },
    editBit: function(bit) {
        var $b = $('[data-id=' + bit.id + '] .bit__text');
        var shared_text = $('[data-id=' + bit.id + ']').data('shared');
        var old_text = $b.text();
        
        if (!Config.OT_ENABLED || !old_text.trim().length || !window.chrome) {
            debug('ot')('Updating contents without using OT');
            $b.text(bit.text);
            return;
        }
        
        if (old_text == shared_text) { 
            var new_text = bit.text;
            debug('ot')('Old text: ', old_text);
            debug('ot')('New text: ', new_text);
        } else { // local modifications
            debug('ot')('Remotely edited text has local modifications; merging.');
            var dmp = new diff_match_patch();
            var patch = dmp.patch_make(shared_text, bit.text);
            var new_text = dmp.patch_apply(patch, old_text);
            debug('ot')('Shared text: ', shared_text);
            debug('ot')('Remote text: ', bit.text);
            debug('ot')('Patch from shared to remote: ',patch)
            debug('ot')('Local text: ', old_text);
            debug('ot')('Merged text (apply shared->remote to local) info: ', new_text);
            new_text = new_text[0];
            App.clientEditedBit({id: bit.id, text: new_text});
            // ou si le patch failed, de local à remote
        }

        $('[data-id=' + bit.id + ']').data('shared',new_text);

        var ot_steps = Utils.getOt(old_text, new_text);
        
        debug('ot')('Steps: ', ot_steps);
        
        $b.get(0).normalize();
        
        var sel = rangy.getSelection($b.get(0));
        var sel_range = $b.is(':focus') && sel.getAllRanges()[0];
        
        if (sel_range) {
            var sel_start = sel_range.startOffset;
            var sel_end = sel_range.endOffset;
            debug('ot')('Old text selection offsets: ', sel_start, sel_end);
        }
        else {
            debug('ot')('No selection in this bit.');
        }
        
        ot_steps.forEach(o => {
            if (o[1] == "insert") {
                var range = rangy.createRangyRange($b.get(0));
                range.setStartAndEnd($b.get(0).childNodes[0],o[0],o[0]);
                range.insertNode(document.createTextNode(o[2]));
                if (sel_range) {
                    if (o[0] <= sel_start)
                        sel_start+=o[2].length;
                    
                    if (o[0] < sel_end)
                        sel_end+=o[2].length;
                }
            }
            else {
                var range = rangy.createRangyRange($b.get(0));
                range.setStartAndEnd($b.get(0).childNodes[0],o[0],o[0]+o[2]);
                range.deleteContents();
                if (sel_range) {
                
                    if (o[0] + o[2] < sel_start) { // Range is before selection
                        sel_start-=o[2];
                        sel_end-=o[2];
                    } else if (o[0] >= sel_end) { // Range is after selection (?)
                        
                    } else if (o[0] < sel_start && o[0]+o[2] <= sel_end) { // Range starts before selection, ends within selection
                        sel_start=o[0]+o[2];
                        sel_start-=o[2];
                        sel_end-=o[2];
                    } else if (o[0] >= sel_start && o[0]+o[2] <= sel_end) { // Range is within selection
                        sel_end-=o[2];
                    } else if (o[0] >= sel_start && o[0]+o[2] > sel_end) { // Range starts within selection, ends after selction
                        sel_end-=sel_end-o[0];
                    } else if (o[0] < sel_start && o[0]+o[2] > sel_end) { // Range starts before selection, ends after selection
                        sel_start=o[0];
                        sel_end=o[0];
                    } else {
                        console.error("Range conditions were thought to be exhaustive but in fact aren't",o[0],o[2],sel_start,sel_end);
                    }
                    
                }
            }
            $b.get(0).normalize();
        });
        
        if (sel_range) {
            debug('ot')('New text selection offsets: ', sel_start, sel_end);
            var new_sel_range = rangy.createRangyRange($b.get(0));
            new_sel_range.setStartAndEnd($b.get(0).childNodes[0], sel_start, sel_end);
            sel.setRanges([new_sel_range]);
        }
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
        connectedUsersCount: 0,
    },
    methods: {
        initializeSocketEvents: function() {
            if (location.hostname == 'swarm.ovh' || 1)
                this.socket = io.connect('https://dashpad.me:1336');
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
                debug('sockets')('Connected');

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
                    document.title = this.roomName + ' – Dashpad';
                }
            });

            this.socket.on('connectedUsersCount', (count) => {
              debug('sockets')('Received connectedUsersCount', count);
              this.connectedUsersCount = count;
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
                debug('sockets')('Received tempIdIsId', obj);
                View.tempIdIsId(obj.temp_id, obj.id);
            });

            this.socket.on('new', (bit) => {
                debug('sockets')('Received new', bit);
                View.appendBit({
                    left: bit.left,
                    top: bit.top,
										text: bit.text || ''
                }, bit.id)
            });

            this.socket.on('move', function(updatedBit) {
                debug('sockets')('Received move', updatedBit);
                View.moveBit(updatedBit)
            });

            this.socket.on('delete', function(id) {
                debug('sockets')('Received delete', id);
                View.deleteBit({
                    id: id
                });
            });

            this.socket.on('edit', function(bit) {
                debug('sockets')('Received edit', bit);
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

/* tests:
assert_eq(get_merged({shared: 'WOOPI', remote: 'WZOOPI', local: 'WOOPAI'}),'WZOOPAI');
*/