'use strict';

var dc = debug('events-client');
var dv = debug('events-view');

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

    // apply shared->remote to local
    rebase_with_status: function (shared, remote, local) {
        var dmp = new diff_match_patch();
        var patch = dmp.patch_make(shared, remote);
        return dmp.patch_apply(patch, local);
    },
    // [index,"insert",text]
    // [index,"remove",length]
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
    },
    getNewSelRangeFromOt: function (ot_steps, sel_start, sel_end) {
        var sel_steps = ot_steps.map(o => {
            if (o[1] == "insert") {
                if (o[0] <= sel_start)
                    sel_start+=o[2].length;
                
                if (o[0] < sel_end)
                    sel_end+=o[2].length;
            }
            else {
                if (o[0] + o[2] < sel_start) { // Range is before selection
                    sel_start-=o[2];
                    sel_end-=o[2];
                } else if (o[0] >= sel_end) { // Range is after selection (?)
                    
                } else if (o[0] < sel_start && o[0]+o[2] <= sel_end) { // Range starts before selection, ends within selection
                    sel_start=o[0]+o[2]; // @@refactor me todo et pas utiliser les -=
                    sel_start-=o[2];
                    sel_end-=o[2];
                } else if (o[0] >= sel_start && o[0]+o[2] <= sel_end) { // Range is within selection
                    sel_end-=o[2];
                } else if (o[0] >= sel_start && o[0]+o[2] > sel_end) { // Range starts within selection, ends after selction
                    sel_end-=sel_end-o[0];
                } else if (o[0] < sel_start && o[0]+o[2] > sel_end) { // Range starts before selection, ends after selection
                    sel_start=o[0];
                    sel_end=o[0];
                } else { // todo quickcheck ot exhaustive
                    console.error("Range conditions were thought to be exhaustive but in fact aren't",o[0],o[2],sel_start,sel_end);
                }
            }
            return {sel_start: sel_start, sel_end: sel_end, context: o};
        });
        return {
            new_sel_start: sel_steps[sel_steps.length-1].sel_start,
            new_sel_end:sel_steps[sel_steps.length-1].sel_end,
            verbose: sel_steps
        }
    }
};

// # VIEW UTILS
var View = {
    // this is front-related config
    GRID_X: 10,
    GRID_Y: 14,
    // this could go in view utils
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

        // to solve circular dependency: declare client first, then server; subscribe after?
        // ou sinon utiliser un mécanisme qui call que une fois que c'est défini
        events.client.bit_deleted = $('#bit-holder').asEventStream('mousedown', '.bit__delete').map(e => ({
            id: $(e.target).parent().data('bit-server-id'),
            text: thisView.getPlaintextFrom$BitMessage($(e.target).siblings('.bit__text')),
            left: $(e.target).parent().css('left'),
            top: $(e.target).parent().css('top'),
            $bit: $(e.target).parent()
        })).doAction(bit => dc('Client deleted bit', bit));
        events.client.bit_deleted.onValue(bit => {
            if (bit.text) {
                this.cancelToastBit = Object.assign({},bit);
                this.showCancelToast = true;
                // this.showCancelToastTimeout = setTimeout(() => {
                //  	this.showCancelToast = false; }, 5000)
            }

            // remove following and put it in the "event subscribe" section of the file
            thisView.delete$Bit(bit.$bit)
            return true;
        })

        // todo pointer events none on canvas when no internet
        events.client.bit_created = $('#canvas').asEventStream('mousedown').filter(e => e.target == $('#canvas').get(0)).doAction('.preventDefault').map(function(e) {    
            var parentOffset = $(e.target).offset();
            var relX = e.pageX - parentOffset.left;
            var relY = e.pageY - 35 // top margin;; - parentOffset.top - 5;
            
            // Grid
            relX = Math.round(relX / thisView.GRID_X) * thisView.GRID_X
            relY = Math.round(relY / thisView.GRID_Y) * thisView.GRID_Y
            var bit_client_id = Math.floor(Math.random() * 100000); // magic is happening
            return {left: relX, top: relY, bit_client_id: bit_client_id};
        }).doAction(bit => dc('Client created bit', bit));
        // events.client.bit_created.and() .. no internet
        // ou bloquer avant/autrement

        events.client.bit_created.onValue(bit => {
            thisView.appendBit({
                left: bit.left,
                top: bit.top,
                bit_client_id: bit.bit_client_id,
            }, true);
        })

                
        events.view.bit_shortcut_moved = $(document).asEventStream('keydown', '.bit__text')
            .filter(e => e.altKey && e.keyCode >= 37 && e.keyCode <= 40)
            .doAction('.preventDefault')
            .map((e) => {
                var $bit = $(e.target).closest('.bit')
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

                $bit.css('left', newX + 'px'); // todo dry ?
                $bit.css('top', newY + 'px');

                // @todo dry ".hydrateWithServerIdOrClientId"
                if (typeof($bit.data('bit-server-id')) === 'undefined')
                    return {   
                        left: newX,
                        top: newY,
                        bit_client_id: $bit.data('bit-client-id')   
                    }
                else
                    return {
                        left: newX,
                        top: newY,
                        bit_server_id: $bit.data('bit-server-id')
                    }
            })
            .doAction(bit => dv('View moved bit using Alt+ArrowKey shortcut', bit));

        // todo repasser
				$('#bit-holder').on('focus', '.bit__text', (e) => {
                    // [bacon.js] cascadememory could be a module that listens to Client.FocusOnBitText which is $madeFromDom
                    // in which case
                    // the DOM event listener would be built-in the events.js declaration (urgh)
                    // how to differentiate empty observables from not empty ones?
                    // simply have it be an empty observable and call .next() here?
                    // but then not leveraging the $fromdom 

                    // maybe we could have a section at the to of view.js and server.js with the list of
                    // events defined for this section
                    // like Events.View = { DeleteBit: bacon.fromdom.. }

                    // weeeell state could theoretically also be a stream, but I think that's too much
                    // ! the stream should be called with the .bit, no the .bit__text (there might be some tranformation needed; we can inline it at declaration level)
                    cascadeMemory.$bit = $(e.target).closest('.bit');
                    cascadeMemory.height = $(e.target).closest('.bit').height();
                    // could also simply not register the stream in the global stream
                    // and simply do bacon.fromdom() => {} which is just equivalent syntax so doesn't make difference...
                    // OK SO: register the bacon.fromdom as a global stream, so we can make a standalone cascadememory module after!!! which just subscribes
                    // this could be registered at the top, at the time of streams declaration

                    // here we would do BitFocus.subscribe
					$(e.target).closest('.bit').css('z-index','1').addClass('focus')
				})

                // same as before : declare at the top fromdom; here we would just subscribe
                // bam the focus component :D
				$('#bit-holder').on('blur', '.bit__text', (e) => {
					$(e.target).closest('.bit').css('z-index','').removeClass('focus')
				})

        // this would be at the bottom in its own module
        // not sure if state is necessary; could use streams
        var cascadeMemory = {$bit: $(''), initialHeight: 0}

        // Prevent from pasting formatted text
        // mmm this could stay this way, no real point (standalone)
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

        // this could be declred at the to as BitKeyUp event; and the following would be in the
        // cascade part of the code
        // BitKeyUp called with Bit (not bit__text, otherwise it'd be bittextkeyup)
        $('#bit-holder').on('keyup', '.bit__text', (e) => {
          var $bit = $(e.target).closest('.bit');
          if (cascadeMemory.$bit.is($bit) // security check
            && cascadeMemory.height != $bit.height()) {
                // okay theoretically we could really use declarative mode and use
                // loads of streams and be like
                // KeyUp = xxx
                // HeightChanged = KeyUp.filter...
                // HeightChanged.subscribe ...
                // we could also use this syntax for declaring all sorts of streams and middleware
                // and expose the need-to-be-exposed streams at the end
                // naming convention like maj(public)/min could be used
                // ^ this is not a bad idea
              var difference = $bit.height() - cascadeMemory.height;
              var oldHeight = cascadeMemory.height;
              cascadeMemory.height = $bit.height()
              debug('cascade')('Detected change in bit height',difference)
              this.get$BitsAdjacentTo$Bit($(e.target).closest('.bit'),oldHeight).forEach(function($el) {
                var newY = parseInt($el[0].style.top)+difference;
                $el.css('top', newY + 'px');
                App.clientMovedBit({
                  id: $el.attr('data-bit-server-id'),
                  top: newY,
                  left: $el[0].style.left
                })
              })
            }
        });


        // todo "bits-holder" pas "bit-holder"
        // todo throttle ici ; ne pas calculer le getplaintext à chaque fois
        events.client.bit_edited = $('#bit-holder').asEventStream('input', '.bit__text').map(e => {
            // Doesn't matter if we put this inside the callforward
            var $bit_message = $(e.target);
            var plaintext = this.getPlaintextFrom$BitMessage($bit_message);
            var $bit = $bit_message.closest('.bit')

            if (typeof($bit.data('bit-server-id')) === 'undefined')
                return {
                    text: plaintext,
                    bit_client_id: $bit.data('bit-client-id')   
                }
            else
                return {
                    text: plaintext,
                    bit_server_id: $bit.data('bit-server-id')
                }
        }).doAction(bit => dc('Client edited bit', bit));

        // window.onbeforeunload = function() {
        //     if (App.notSaved())
        //         return 'Please wait a short while so we can save your message.';
        //     else
        //         return null;
        // }
    },
    // Events.Server.BitCreated.subscribe
    // Events.Client/View(aka).BitCreated.subscribe
    appendBit: function(bit, created_by_user) {
        var id = bit.bit_client_id || bit.bit_server_id;
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
                    var uniqid = $bit.data('bit-client-id') || $bit.data('bit-server-id');

                    // events.client.movedbit.next()
                    // dans server.js, throttle, mais c'est déjà fait
                    Utils.setTimeoutUniqueRepeatUntil(() => {
                        if (typeof($bit.data('bit-server-id')) === 'undefined')
                            return false
                        App.clientMovedBit({
                            id: $bit.data('bit-server-id'),
                            left: ui.position.left,
                            top: ui.position.top
                        })
                    }, Config.SERVER_SEND_THROTTLE_INTERVAL, 'move#' + uniqid)
                }
            });

        //uuuuuuuuuuuuuuuuuuuuuh
        //not sure, if both the streams are subscribed by the same callback
        if (created_by_user) {
            $bit.find('.bit__text').focus();
            $bit.attr('data-bit-client-id', id) // rather than .data() so that we can search for an id using CSS selectors
        } else
            $bit.attr('data-bit-server-id', id) // rather than .data() so that we can search for an id using CSS selectors
 
        $bit.find('.bit__text').focusout(this.deleteIfEmpty) // global DOM event rather
        // keep the cb name 
    },
    removeAllBits: function() {
        $('#bit-holder .bit__text').remove();
    },
    //server.editbit.subscribe
    editBit: function(bit) {
        var $b = $('[data-id=' + bit.id + '] .bit__text');

        var shared_text = $('[data-id=' + bit.id + ']').data('shared');
        var old_text = $b.text();
        
        if (!Config.OT_ENABLED || !old_text.trim().length || !window.chrome) {
            debug('ot')('Updating contents without using OT');
            $b.text(bit.text);
            return;
        }
        
        // Get new text
        if (old_text == shared_text) { 
            var new_text = bit.text;
            debug('ot')('No unsent local modifications.')
            debug('ot')('Old text: ', old_text);
            debug('ot')('New text: ', new_text);
        } else { // local modifications
            debug('ot')('Remotely edited text has local modifications; merging.');
            var new_text = Utils.rebase_with_status(shared_text, bit.text, old_text);
            debug('ot')('Shared text: ', shared_text);
            debug('ot')('Remote text: ', bit.text);
            debug('ot')('Local text: ', old_text);
            debug('ot')('Merged text (apply shared->remote to local) info: ', new_text);
            new_text = new_text[0];
            // trigger events.client.editedBit
            // @todo when to know if the view stuff is already done before the stream nextd
            // or if it is done on subscribe?
            App.clientEditedBit({id: bit.id, text: new_text});
            // ou si le patch failed, de local à remote
        }

        // Set new text as shared
        $('[data-id=' + bit.id + ']').data('shared',new_text);

        // Get OT
        var ot_steps = Utils.getOt(old_text, new_text); // util the shit out of it
        debug('ot')('Steps: ', ot_steps);
        
        // Get selection range
        $b.get(0).normalize();
        var sel = rangy.getSelection($b.get(0));
        var sel_range = $b.is(':focus') && sel.getAllRanges()[0];
        
        // Compute new selection range
        if (sel_range) {
            var old_sel_start = sel_range.startOffset;
            var old_sel_end = sel_range.endOffset;
            debug('ot')('Old text selection offsets: ', old_sel_start, old_sel_end);
            var {new_sel_start, new_sel_end, verbose} = Utils.getNewSelRangeFromOt(ot_steps, old_sel_start, old_sel_end);
            debug('ot')('New selection range', new_sel_start, new_sel_end, verbose);
        }
        else {
            debug('ot')('No selection in this bit.'); // oh yeah debugs
        }

        // next: @todo
        // !!!use algebraic data types for ot: 
        // data OT = InsertOt Int String | DeleteOt Int Int
        // utils.getnewselrangefromot([InsertOt 0 "hi", DeleteOt 7 7])
        
        // Apply OT
        ot_steps.forEach(o => {
            if (o[1] == "insert") {
                var range = rangy.createRangyRange($b.get(0));
                range.setStartAndEnd($b.get(0).childNodes[0],o[0],o[0]);
                range.insertNode(document.createTextNode(o[2]));
            }
            else {
                var range = rangy.createRangyRange($b.get(0));
                range.setStartAndEnd($b.get(0).childNodes[0],o[0],o[0]+o[2]);
                range.deleteContents();
            }
            $b.get(0).normalize();
        });
        
        // Update selection range
        if (sel_range) {
            debug('ot')('New text selection offsets: ', new_sel_start, new_sel_end);
            var new_sel_range = rangy.createRangyRange($b.get(0));
            new_sel_range.setStartAndEnd($b.get(0).childNodes[0], new_sel_start, new_sel_end);
            sel.setRanges([new_sel_range]);
        }
    },
    // server.movebit.subscribe (check if called locally also)
    moveBit: function(bit) {
        $('[data-id=' + bit.id + ']').css({
            top: bit.top,
            left: bit.left
        });
    },
    // server.deletebit.subscribe
    deleteBit: function(bit) {
			this.delete$Bit($('[data-id=' + bit.id + ']'));
    },
    // wtf brah
		delete$Bit: function($bit) {
			$bit.addClass('being-removed')
			setTimeout(() => {
				$bit.remove();
			}, 500)
		},
    // subscribe focusout delete if empty, make it a module
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
        firstConnection: true,
				noInternet: false,
        flags: [],
        roomName: null,
        socket: undefined,
				cancelToastBit: {},
				showCancelToast: false,
				showCancelToastTimeout: -1,
        connectedUsersCount: 0,
    },
    methods: {
        initializeSocketEvents: function() {
          
            events.client.pad.onValue(p => {
                this.roomName = p.pad;
                if ('secret' in p.flags) {
                    window.history.pushState({}, null, '/');
                } else if (p.pad.length){
                    document.title = p.pad + ' – Dashpad'; // todo else
                }
            });

            // First connection failed
            events.server.disconnected.takeUntil(events.server.connected).onValue(e => {
                this.screen = 'error'
            });

            events.server.disconnected.skipUntil(events.server.connected).onValue(e => {
                this.noInternet = true;
                View.setReadOnly(); // todo meh
            });

            events.server.connected_users_count.onValue(count => {
                this.connectedUsersCount = count;
            });

            // view: todo do not refresh if states are the same, hashdiff it somehow
            events.server.bits_dump.onValue(bits => {
                this.noInternet = false; // what are you
                View.removeAllBits(); // @todo View.setBits({}) & standardize bit object : {id: ...}
                $.each(bits, function(i, bit) {
                    View.appendBit({
                        left: bit.left,
                        top: bit.top,
                        text: bit.text,
                        bit_server_id: bit.id
                    })
                });
                this.screen = 'active'
            });

            // @todo encodage

            events.server.bit_temp_id_is_id.onValue(obj => {
                $('[data-bit-client-id=' + obj.temp_id + ']').attr('data-bit-server-id', obj.id);
            });

            events.server.bit_created.onValue(bit => {
                ds('Bit was created; creating bit in view.')
                View.appendBit({
                    left: bit.left,
                    top: bit.top,
                    text: bit.text || '',
                    bit_server_id: bit.id,
                })  // utiliser flow
            });

            events.server.bit_moved.onValue(updatedBit => {
                dc('Bit was moved; moving bit in view.')
                View.moveBit(updatedBit)
            });

            events.server.bit_deleted.onValue(id => {
                dc('Bit was deleted; removing bit from view.')
                View.deleteBit({
                    id: id
                });
            });

            events.server.bit_edited.onValue(bit => {
                dc('Bit was edited; updating bit in view.')
                View.editBit(bit);
            })
        },
				onClickCancelToast: function() { // you get the idea
					this.showCancelToast = false;
					clearTimeout(this.showCancelToastTimeout);
					var id = Math.floor(Math.random() * 100000); // magic is happening
					View.appendBit({
							left: this.cancelToastBit.left,
							top: this.cancelToastBit.top,
							text: this.cancelToastBit.text,
                            bit_client_id: id
					}, true)
					this.clientCreatedBit(this.cancelToastBit)
				},
        clientMovedBit: function(bit) { // @todo del
            this.socket.emit('move', {
                id: bit.id,
                left: bit.left,
                top: bit.top
            });
        },
        notSaved: function() { // what the fuck
            return Object.keys(Utils.setTimeoutUnique()).length > 0
        }
    }
})

App.initializeSocketEvents();
View.initializeEvents();

/* tests:
assert_eq(get_merged({shared: 'WOOPI', remote: 'WZOOPI', local: 'WOOPAI'}),'WZOOPAI'); using Chai
*/

// woohoo




//// MODULES

/// ALT+ARROW

// fromDom(keydown,'document','.bit__text').filter(e => e.alt...).map(() => {top: x, left: y}).redirectTo(ClientMovedBit)
// ou plutôt que redirectTo, c'est le résultat en fait qui est ClientMovedBit!
// ClientMovedBit = ...
// plutôt qu'utiliser un standard min/maj pour savoir si c'est exposed ou pas,
// utiliser Events.View.ClientMovedBit = ...
// parce que ClientMovedBit est utilisé après aussi par drag, plutôt uilisr next que déclarer
// :)
// et evtl déclarer tous les evts au début (juste la structure du json, avec :null)
// et freeze!!!
// hmmm ce serait cool de définir le pattern de ce que l'event renvoie, tout en haut aussi
// YES
// eventsview are internal to view; don't get accessed by server

    /*
      /*
    in movedbit
    App.clientMovedBit({
            id: $bit.attr('data-bit-server-id'),
            top: newY,
            left: newX
        })
    */

events.client.bit_moved = events.view.bit_shortcut_moved.doAction(bit => {dc('Client moved bit', bit)}); // @todo clone

// !! indicateur de loading :)
callAfterView();

// flow: dire qu'on attend Bit_ServerId (précise)
events.server.client_edited_bit_sent.onValue(bit => {
    $('[data-bit-server-id=' + bit.bit_server_id + ']').data('shared',bit.text);
});


// todo rem bit.id data

// test ot quickcheck, cf position curseur quand prepend et apend doit être au même endroit, etc. ; quand prepend et append à des endroits différents en-dehors de la sélection, la sélection doit être la même

function test() {
    var new_text = Utils.rebase_with_status('WOOPI','WOOPAI','WZOOPI')
    new_text = new_text[0];
    console.assert(new_text == 'WZOOPAI')

    function test_getNewSelRangeFromOt(tagged_text, ot) {
        var {sel_start: old_sel_start, sel_end: old_sel_end} = test_getSel(tagged_text)
        var text = tagged_text.replace(/[\[\]]/g,'');
        var {new_sel_start: sel_start, new_sel_end: sel_end} = Utils.getNewSelRangeFromOt(ot, old_sel_start, old_sel_end);
        return {sel_start, sel_end}
    }
    function test_getSel(tagged_text) {
        var sel_start = tagged_text.indexOf('[');
        var sel_end = tagged_text.indexOf(']')-1;
        return {sel_start, sel_end};
    }
    function test_deep_eql(a,b) {
        // console.log('deep_eql',a,b,JSON.stringify(a) == JSON.stringify(b))
        return JSON.stringify(a) == JSON.stringify(b);
    }

    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[2,'remove',1]]), test_getSel('AB[DEF]GHI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[2,'remove',2]]), test_getSel('AB[EF]GHI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[2,'remove',4]]), test_getSel('AB[]GHI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[2,'remove',5]]), test_getSel('AB[]HI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[3,'remove',2]]), test_getSel('ABC[F]GHI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[3,'remove',3]]), test_getSel('ABC[]GHI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[3,'remove',4]]), test_getSel('ABC[]HI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[4,'remove',1]]), test_getSel('ABC[DF]GHI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[4,'remove',2]]), test_getSel('ABC[D]GHI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[4,'remove',3]]), test_getSel('ABC[D]HI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[6,'remove',1]]), test_getSel('ABC[DEF]HI')));
    console.assert(test_deep_eql(test_getNewSelRangeFromOt('ABC[DEF]GHI', [[7,'remove',1]]), test_getSel('ABC[DEF]GI')));
    console.log('All tests passed.')

    // test properties cf si range n'est pas à l'intérieur alors la newSel est la même etc
    // ou pour UNE DEL ARBITRAIRE (c'est un seul cas d'utilistion):
    // (dans le champ des possibles (créer générateur)) la NewSel correspond à {set theory} OldSel \ DelRange

    // console.assert(out of bounds removes ?) dans le code de ot?
}