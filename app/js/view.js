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
            thisView.delete$Bit(bit.$bit) // @TODO deleteBit(Bit) plutôt !
            return true;
        })

        // todo pointer events none on canvas when no internet
        events.client.bit_created = $('#canvas').asEventStream('mousedown').filter(e => e.target == $('#canvas').get(0)).doAction('.preventDefault').map(function(e) {    
            var parentOffset = $(e.target).offset();
            // @TODO this is messed up
            var relX = e.pageX - parentOffset.left; // todo test mobile - parentOffset.left;
            var relY = e.pageY - 35 // top margin;; - parentOffset.top - 5;
            
            // Grid
            relX = Math.round(relX / thisView.GRID_X) * thisView.GRID_X
            relY = Math.round(relY / thisView.GRID_Y) * thisView.GRID_Y
            var bit_client_id = Math.floor(Math.random() * 100000); // magic is happening
            return {left: relX, top: relY, bit_client_id: bit_client_id};
        }).doAction(bit => dc('Client created bit', bit));
        // events.client.bit_created.and() .. no internet
        // ou bloquer avant/autrement

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

        events.view.bit_focus = $('#bit-holder').asEventStream('focus', '.bit__text').map(e => $(e.target).closest('.bit').get(0));
        events.view.bit_blur = $('#bit-holder').asEventStream('blur', '.bit__text').map(e => $(e.target).closest('.bit').get(0));

        // @@@

        

        // Prevent from pasting formatted text
        // mmm this could stay this way, no real point (standalone)
        $('#bit-holder').asEventStream('paste', '.bit__text').onValue($e => {
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
        events.view.bit_keyup = $('#bit-holder').asEventStream('keyup', '.bit__text').map(e => $(e.target).closest('.bit').get(0))

        // todo "bits-holder" pas "bit-holder"
        // todo throttle ici ; ne pas calculer le getplaintext à chaque fois
        events.view.bit_edited = $('#bit-holder').asEventStream('input', '.bit__text').map(e => {
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
        }).doAction(bit => dv('Client manually edited bit', bit));
        events.client.bit_edited = events.view.bit_edited.merge(events.view.bit_update_from_remote.filter(b => b.strategy == 'ot-to-merged').map(b => { b.text = b.target_text; return b; }));

        events.view.bit_drag_start = new Bacon.Bus();
        events.view.bit_drag_start.onValue(bit => {
            $(bit.DOMb).addClass('being-dragged');
            console.log($(bit.DOMb));
            dv('Start drag',bit)
        });
        
        events.view.bit_drag_stop = new Bacon.Bus();
        events.view.bit_drag_stop.onValue(bit => {
            $(bit.DOMb).removeClass('being-dragged');
            dv('Stop drag',bit)
        });

        events.client.bit_created
            .merge(
                events.server.bit_created
                    .map(bit => ({
                        left: bit.left,
                        top: bit.top,
                        text: bit.text || '',
                        bit_server_id: bit.id,
                    })))  // utiliser flow
            .merge(
                events.server.bits_dump
                    .doAction(bits => { // view: todo do not refresh if states are the same, hashdiff it somehow
                        App.noInternet = false; // what are you
                        $('#bit-holder .bit__text').remove();
                        // View.removeAllBits(); // @todo View.setBits({}) & standardize bit object : {id: ...}
                        App.screen = 'active';
                        // move this to the global onvalue further down
                        // but then it's not about appending a bit any longer
                    })
                    .flatMapLatest(bits => 
                        Bacon.fromArray(bits.map(bit => ({
                            left: bit.left,
                            top: bit.top,
                            text: bit.text,
                            bit_server_id: bit.id
                    }))))
            )
            .onValue(bit => { // @@@ I can either group by end effect (all the sources in the same place -- what I'm doing) or group by causes (e.g. section "server events") and redirect to end effect ; could also use both views in a flow programming interface ; would obviate the problem (!!!!)
                var id = bit.bit_client_id || bit.bit_server_id;
                var thisView = this;
                // @todo delete if exists? then we don't neeed "removelallbits" and "nointernet" and "this.screen"
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
                            events.view.bit_drag_start.push({bit_server_id: bit.bit_server_id, bit_client_id: bit.bit_client_id, DOMb: $bit.get(0)});
                        },
                        stop: function(e, ui) {
                            events.view.bit_drag_stop.push({bit_server_id: bit.bit_server_id, bit_client_id: bit.bit_client_id, DOMb: $bit.get(0), left: ui.position.left, top: ui.position.top});
                        }
                    });

                // I guess it's ok...
                if (bit.bit_client_id) {
                    $bit.find('.bit__text').focus();
                    $bit.attr('data-bit-client-id', id) // rather than .data() so that we can search for an id using CSS selectors
                } else
                    $bit.attr('data-bit-server-id', id) // rather than .data() so that we can search for an id using CSS selectors
        
                $bit.find('.bit__text').focusout(() => {
                    // subscribe focusout delete if empty, make it a module
                    
                    if ($(this).text().length < 1) {
                        $(this).siblings('.bit__delete').trigger('mousedown');
                    }
                }) // global DOM event rather
            })

    },
    delete$Bit: function($bit) {
        $bit.addClass('being-removed')
        setTimeout(() => {
            $bit.remove();
        }, 500)
    },
    getPlaintextFrom$BitMessage: function($bit_message) { // could be util?
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
        initializeSocketEvents: function() { // purely reactive
          
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

            // @todo encodage

            events.server.bit_temp_id_is_id.onValue(obj => {
                $('[data-bit-client-id=' + obj.temp_id + ']').attr('data-bit-server-id', obj.id);
            });

            events.server.bit_moved.onValue(bit => {
                dc('Bit was moved; moving bit in view.')
                $('[data-bit-server-id=' + bit.id + ']').css({
                    top: bit.top,
                    left: bit.left
                });
            });

            events.server.bit_deleted.onValue(id => {
                dc('Bit was deleted; removing bit from view.')
			    this.delete$Bit($('[data-bit-server-id=' + bit.id + ']'));
            });

            events.view.bit_update_from_remote = events.server.bit_edited.map(bit => {
                bit.bit_server_id = bit.id; // todo clean les conventions de partout du serv et tout
                var $b = $('[data-bit-server-id=' + bit.bit_server_id + '] .bit__text');

                // @todo prove that shared_text exists
                var shared_text = $('[data-bit-server-id=' + bit.bit_server_id + ']').data('shared'); // todo use helpers $getSharedTextFor$Bit(bit: Bit)
                var local_text = $b.text();
                var remote_text = bit.text;
                // data Ot = OtToRemote | OtToMerged
                // data Strategy = NoOt | Ot


                if (!Config.OT_ENABLED || !local_text.trim().length || !window.chrome) {
                    var strategy = 'no-ot';
                    var target_text = remote_text;
                    var ot_steps = null;
                    debug('ot')('Updating contents without using OT');
                }
                else {
                    // Get new text
                    if (local_text == shared_text) { 
                        var strategy = 'ot-to-remote';
                        var target_text = remote_text;
                        debug('ot')('No unsent local modifications.')
                        debug('ot')('Old text: ', local_text);
                        debug('ot')('New text: ', target_text);
                    } else { // local modifications
                        var strategy = 'ot-to-merged';
                        var rebase_result = Utils.rebase_with_status(shared_text, remote_text, local_text);
                        var target_text = rebase_result[0];
                        debug('ot')('Remotely edited text has local modifications; merging.');
                        debug('ot')('Shared text: ', shared_text);
                        debug('ot')('Remote text: ', remote_text);
                        debug('ot')('Local text: ', local_text);
                        debug('ot')('Merged text (apply shared->remote to local) info: ', rebase_result);
                        // ou si le patch failed, de local à remote
                    }

                    // Get OT
                    var ot_steps = Utils.getOt(local_text, target_text); // util the shit out of it
                    debug('ot')('Steps: ', ot_steps);
                }

                return {
                        bit_server_id: bit.bit_server_id,
                        strategy,
                        target_text: target_text,
                        ot_steps,
                }
                    // : BitMergeInfo
            }).doAction(b => {dv('Bit update from remote: ',b)});
            events.view.bit_update_from_remote.onValue(bit => {
                var $b = $('[data-bit-server-id=' + bit.bit_server_id + '] .bit__text');

                // Set new text as shared
                $('[data-bit-server-id=' + bit.bit_server_id + ']').data('shared',bit.target_text);
                
                if (bit.strategy == 'no-ot') {
                    $b.text(bit.target_text);
                    return;
                }

                // Get selection range
                $b.get(0).normalize();
                var sel = rangy.getSelection($b.get(0));
                var sel_range = $b.is(':focus') && sel.getAllRanges()[0];
                
                // Compute new selection range
                if (sel_range) {
                    var old_sel_start = sel_range.startOffset;
                    var old_sel_end = sel_range.endOffset;
                    debug('ot')('Old text selection offsets: ', old_sel_start, old_sel_end);
                    var {new_sel_start, new_sel_end, verbose} = Utils.getNewSelRangeFromOt(bit.ot_steps, old_sel_start, old_sel_end);
                    debug('ot')('New selection range', new_sel_start, new_sel_end, verbose);
                }
                else {
                    debug('ot')('No selection in this bit.'); // oh yeah debugs
                    // @TODO then don't apply ot, simply replace? hm, more of the same
                }

                // next: @todo
                // !!!use algebraic data types for ot: 
                // data OT = InsertOt Int String | DeleteOt Int Int
                // utils.getnewselrangefromot([InsertOt 0 "hi", DeleteOt 7 7])
                
                // Apply OT
                bit.ot_steps.forEach(o => {
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
                    var new_sel_range = rangy.createRangyRange($b.get(0));
                    new_sel_range.setStartAndEnd($b.get(0).childNodes[0], new_sel_start, new_sel_end);
                    sel.setRanges([new_sel_range]);
                }
            });
        },
				// onClickCancelToast: function() { // you get the idea
					// this.showCancelToast = false;
					// clearTimeout(this.showCancelToastTimeout);
					// var id = Math.floor(Math.random() * 100000); // magic is happening
					// View.appendBit({
					// 		left: this.cancelToastBit.left,
					// 		top: this.cancelToastBit.top,
					// 		text: this.cancelToastBit.text,
                    //         bit_client_id: id
					// }, true)
					// this.clientCreatedBit(this.cancelToastBit)
				// },
    }
})

App.initializeSocketEvents();
View.initializeEvents();

// woohoo




//// MODULES

/// PLUGGING IN FROM THE SERVER
        


/// @todo modulify more things? cf bit dump & loading screen handling
/// FOCUS MODULE
events.view.bit_blur.onValue(DOMb => {
    $(DOMb).css('z-index','').removeClass('focus')
})
events.view.bit_focus.onValue(DOMb => {
    $(DOMb).css('z-index','1').addClass('focus');
});

/// CASCADE
// this could go in view utils
(function() {
    function get$BitsAdjacentTo$Bit($bit,actualHeight) { // get bits to the left, right and bottom
        var refTop = parseInt($bit[0].style.top);
        var refLeft = parseInt($bit[0].style.left);
        var refBottom = refTop + (actualHeight || $bit.height());
        var refRight = refLeft + $bit.width();

        var adjacent$Bits = [];
        var thisView = View; // todo
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
            adjacent$Bits.map(get$BitsAdjacentTo$Bit.bind(this)).reduce((acc, cur) => acc.concat(cur), [])
        )
        .filter((v, i, a) => a.indexOf(v) === i); // uniquify

        return result;
    }

    let dc = debug('view-cascade');

    events.view.bit_height_focussed = events.view.bit_focus.flatMapLatest((DOMb) => { // todo utiliser Bit$ à la place de Bit. Bit$ contient: Bit$.$bit ; Bit$.bit_serverid etc. grosso modo comme Bit mais hydraté avec vue (ou juste vue)
        var $bit = $(DOMb);
        var bit_server_id = $(DOMb).attr('data-server-id');
        return Bacon.once({DOMb, height: $bit.height(), from_remote: false}) // initial height ==> utiliser bit_keyup avec toproperty startswith
        .merge(events.view.bit_update_from_remote.filter(br => br.bit_server_id == bit_server_id).map(b => {
            var height= $(DOMb).height();
            return {DOMb, height, from_remote: true};
        })) // height from remote
        .merge(
            events.view.bit_keyup.map((DOMb) => ({
                DOMb,
                height: $(DOMb).height(),
                from_remote: false,
            }))
        ); // height from keyup (si je leave this out je peux faire, après : onkeyup.Combine(bitheightfoussed) et je peux baser "height changed" sur ça)
    }).doAction(x => {dc('Bit height of focussed bit', x)}) // @todo won't work for newly created bit
   
    events.view.bit_height_changed = events.view.bit_height_focussed.slidingWindow(2,2).filter(([o,n]) => !o.from_remote && o.height !== n.height).map(([o,n]) => ({DOMb: n.DOMb, old_height: o.height, new_height: n.height})).doAction(y => dc('Height changed !',y))

    events.view.bit_cascade_moved = events.view.bit_height_changed.flatMap(({DOMb, old_height, new_height}) => {
        var $bit = $(DOMb);
        var difference = new_height - old_height;
        var res = [];
        get$BitsAdjacentTo$Bit($(DOMb),old_height).forEach(function($el) {
            var newY = parseInt($el[0].style.top)+difference;
            $el.css('top', newY + 'px');

            // @todo peut être seulement client id
            res.push({
                bit_server_id: $el.attr('data-bit-server-id'),
                top: newY,
                left: $el[0].style.left
            })
    
        })
        return Bacon.fromArray(res);
    }).doAction(x => {dc('Cascade changed bit height:',x)});
})();

events.client.bit_moved = events.view.bit_shortcut_moved.merge(events.view.bit_cascade_moved).merge(events.view.bit_drag_stop).doAction(bit => {dc('Client moved bit', bit)}); // @todo clone

// !! indicateur de loading :)
callAfterView();

// flow: dire qu'on attend Bit_ServerId (précise)
events.server.client_edited_bit_sent.onValue(bit => {
    $('[data-bit-server-id=' + bit.bit_server_id + ']').data('shared',bit.text);
});


// test ot quickcheck, cf position curseur quand prepend et apend doit être au même endroit, etc. ; quand prepend et append à des endroits différents en-dehors de la sélection, la sélection doit être la même

events.server.loading.skipDuplicates().onValue(is_loading => {
    console.log('IS LOADING',is_loading)
    if (is_loading)
        window.onbeforeunload = function() {
            if (App.notSaved())
                return 'Please wait a short while so we can save your message.';
            else
                return null;
        }
    else
        window.onbeforeunload = null;
});


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