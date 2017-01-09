'use strict';

// # UTILS
var utils = {
	escapeAndNl2br: function(text) {
		var htmls = [];
		var lines = text.split(/\n/);
		var tmpDiv = jQuery(document.createElement('div'));
		for (var i = 0 ; i < lines.length ; i++) {
			htmls.push(tmpDiv.text(lines[i]).html());
		}
		return htmls.join("<br>");
	}
};

// # VUE
var app = new Vue({
  el: '#app',
  data: {
		GRID_X: 10, /* todo namespace the constants somewhere else than data */
		GRID_Y: 10,
		screen: 'loading', // 'loading' | 'active' | 'error'
		roomName: undefined,
		flags: [],
		bits: []
  },
	methods: {
		initializeSocketEvents: function() {
			socket.on('connect_error', (e) => {
				this.screen = 'error'
			});

			socket.on('connect', () => {
				console.log('CONNECT')
				if (!firstConnection) {
					socket.emit('swarm',room_name);
					return;
				}
				firstConnection = false;

				console.log('CONNECT :: firstTime')
				var [_, roomName, flagsString] = window.location.href.match(/\/([^/+*]*)([+*]*)$/)
				this.flags = flagsString.split('').reduce((acc,flagLetter) => {
					var assoc = {'+' : 'plus', '*': 'secret'};
					if (flagLetter in assoc) acc.push(assoc[flagLetter]);
					return acc;
				}, []);
				this.roomName = roomName;
				console.log('flags : ', this.flags)
				console.log('roomName : ', this.roomName)

				socket.emit('swarm',room_name);

				if ('secret' in flags) {
					window.history.pushState({},null,'/');
				}
			});

			socket.on('catchUp',function(bits) {
				console.log('CATCH UP')
				this.screen = 'active'
				this.bits = bits;
				// $.each(bits,function(i,bit){ appendBit({left: bit.left, top: bit.top, text: bit.text},bit.id); });
			});
			// @todo encodage
			// remove all

			socket.on('tempIdIsId',function(obj){
			   $('[data-tempid='+obj.temp_id+']').attr('data-id',obj.id);
				 // o shit
			});
			socket.on('new',function(bit){
				this.bits.push(bit);
			});
			socket.on('move',function(updatedBit){
				this.bits = this.bits.map((bit) => {
					if (bit.id == bit.id)
					{
						bit.top = updatedBit.top;
						bit.left = updatedBit.left;
					}
					return bit;
				})
			});
			socket.on('delete',function(id){
				this.bits = this.bits.filter((bit) => bit.id != id)
			});
			socket.on('edit',function(bit){
			   $('[data-id='+bit.id+'] .bit__text').html(escapeAndNl2br(bit.text));
			});
		}
	}
})

// # ui functions

function deleteIfEmpty(bit) {
	if ($(this).text().length < 1) {
		$(this).siblings('.bit__delete').trigger('mousedown');
	}
}

function removeAllBits() {
	$('#canvas .bit__text').remove();
}

// Displays a bit
function appendBit(bit,id,created_by_user) {
	if (typeof focus == 'undefined') focus = false;

	var $bit = $($('.template-bit').html()) // or children.clone
		.css({top: bit.top, left: bit.left})
		.find('.bit__text')
			.html(escapeAndNl2br(bit.text || ''))
		.end()
		.appendTo('#canvas')
		.draggable({
			handle: ".bit__handle",
			containment: "parent",
            // grid: [ gridX, gridY ], nécessite que tous les bits soient sur la grille (clean au receive?) mais ça fausse
            drag: function( event, ui ) {
                var snapTolerance = $(this).draggable('option', 'snapTolerance');
                var topRemainder = ui.position.top % gridY; // @todo rename
                var leftRemainder = ui.position.left % gridX;

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
			stop: function(e,ui) { // ou stop comme on veut // @todo foutre ça ailleurs
				$(this).removeClass('being-dragged');
				// @todo, if we move the bit right after creating it and we release before receiving tempIdIsId, the event won't be sent. work out some sort of editTimeout sytem? use helper functions for both timeouts.
				socket.emit('move',{id: $(this).data('id'), left: ui.position.left, top: ui.position.top});
			}
		});

	if (created_by_user) {
		$bit.find('.bit__text').focus();
		$bit.attr('data-tempid',id) // rather than .data() so that we can search for an id using CSS selectors
	}
	else
		$bit.attr('data-id',id) // rather than .data() so that we can search for an id using CSS selectors


	$bit.find('.bit__text').focusout(deleteIfEmpty);
}

// var ff = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

// # var

// Throttles the rate at which we send edit updates to the server
var editTimeouts = {};

var firstConnection = true;
var room_name;

// # procedural

if (location.hostname == 'swarm.ovh')
	var socket = io.connect('http://141.138.157.211:1336');
else
	var socket = io.connect('http://127.0.0.1:1336');

// # ui events

$('#canvas').on('mousedown',function(e){
	if ($(e.target).is('.bit__delete'))
	{
		socket.emit('delete',$(e.target).parent().data('id'));
		$(e.target).parent().remove();
		return true;
	}

	if( e.target !== this )
		return;

	var parentOffset = $(this).offset();
	var relX = e.pageX - parentOffset.left;
	var relY = e.pageY - parentOffset.top - 5;

  // Grid
  relX = Math.round(relX/gridX)*gridX // @todo rename
  relY = Math.round(relY/gridY)*gridY

	var id = Math.floor(Math.random()*100000); // magic is happening
	appendBit({left: relX, top: relY}, id, true);

	socket.emit('new',{id: id, top:relY, left:relX}); //todo wait before edit ?
	return false;
});

$('#canvas').on('input','.bit__text',function(e){ // todo on input sur bit-text?
		var $bit_message = $(e.target);
		var $bit = $bit_message.closest('.bit')
		var id = $bit.data('tempid') || $bit.data('id'); // purely client; so that the editTimeout refers to the same id after reception of tempIdisId
		if (typeof(editTimeouts[id]) !== 'undefined')
			clearInterval(editTimeouts[id]);

		var sendTextToServer = function() {
			if (typeof($bit.data('id')) === 'undefined')
			{
				editTimeouts[id] = setTimeout(sendTextToServer,500);
				return;
			}
			var $el_with_linebreaks = $bit_message.clone().find("br").replaceWith("\n").end();
			// var $el_with_linebreaks = $bit_message.clone();
			// var html_content = $el_with_linebreaks.html().replace(/<\/div></g,"</div>\n<");
			var html_content = $el_with_linebreaks.html().replace(/<div>/g,"<div>\n");
			var plaintext = jQuery(document.createElement('div')).html(html_content).text();

			socket.emit('edit',{id: $bit.data('id'), text: plaintext});
			delete editTimeouts[id];
		}
		editTimeouts[id] = setTimeout(sendTextToServer,500);
});

window.onbeforeunload = function() {
	if (Object.keys(editTimeouts).length > 0)
		return 'Please wait a short while so we can save your message.';
	else
		return null;
}
