'use strict';

var gridX = 10;
var gridY = 10;

// The temporary <div/> is to perform HTML entity encoding reliably.
//
// document.createElement() is *much* faster than jQuery('<div></div>')
// http://stackoverflow.com/questions/268490/
//
// You don't need jQuery but then you need to struggle with browser
// differences in innerText/textContent yourself
function escapeAndNl2br(text) {
	var htmls = [];
	var lines = text.split(/\n/);
	var tmpDiv = jQuery(document.createElement('div'));
	for (var i = 0 ; i < lines.length ; i++) {
		htmls.push(tmpDiv.text(lines[i]).html());
	}
	return htmls.join("<br>");
}

// Throttles the rate at which we send edit updates to the server
var editTimeouts = {};

function removeAllBits()
{
	$('#canvas .bit__text').remove();
}

// Displays a bit
function appendBit(bit,id,created_by_user)
{
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
                var topRemainder = ui.position.top % gridY;
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

if (location.hostname == 'swarm.ovh')
	var socket = io.connect('http://141.138.157.211:1336');
else
	var socket = io.connect('http://127.0.0.1:1336');

socket.on('connect_error', function(e) {
	$('.page').removeClass('active');
	$('.page--internal-error').addClass('active');
});

var firstConnection = true;
var room_name;
socket.on('connect', function() {
	console.log('CONNECT')
	if (!firstConnection) {
		socket.emit('swarm',room_name);
		return;
	}
	firstConnection = false;

	console.log('CONNECT :: firstTime')
	room_name = window.location.href.match(/\/[^/]+$/);
	if (room_name == null) room_name = '';
	else room_name = room_name[0].substr(1);

	function getKeyByValue( value, haystack ) {
		for( var prop in haystack ) {
			if( haystack.hasOwnProperty( prop ) ) {
				 if( haystack[ prop ] === value )
					 return prop;
			}
		}
		return false;
	}

	function parse_room_name(room_name,flags_definition) {

		var flags = {};
		while (room_name.length)
		{
			var flag_name = getKeyByValue(room_name[room_name.length-1], flags_definition);
			if (flag_name === false)
				break;

			room_name = room_name.slice(0,-1);
			flags[flag_name] = true;
		}

		return {room_name: room_name, flags: flags};
	}

	var parsed_room_name = parse_room_name(room_name,{plus: '+', secret: '*'});
	var flags = parsed_room_name.flags;
	room_name = parsed_room_name.room_name;


	$('#canvas').prepend($('<h1></h1>').addClass('swarm-name').text(room_name.length == 0 ? 'swarm' : room_name));
	socket.emit('swarm',room_name);

	if ('plus' in flags)
	{
		$('.swarm-name').css({position: 'fixed'});
		$('#canvas').css({height: 4000});
	}

	if ('secret' in flags)
	{
		window.history.pushState({},null,'/');
		$('.swarm-name').remove();
	}
});

socket.on('catchUp',function(bits) {
	console.log('CATCH UP')
	removeAllBits();
	$('.page').removeClass('active');
	$('.page--swarm').addClass('active');
	$.each(bits,function(i,bit){ appendBit({left: bit.left, top: bit.top, text: bit.text},bit.id); });
});
// @todo encodage
// remove all

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
      relX = Math.round(relX/gridX)*gridX
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

socket.on('tempIdIsId',function(obj){
   $('[data-tempid='+obj.temp_id+']').attr('data-id',obj.id);
});
socket.on('new',function(bit){
   appendBit({left: bit.left, top: bit.top}, bit.id)
});
socket.on('move',function(bit){
   $('[data-id='+bit.id+']').css({top: bit.top, left: bit.left});
});
socket.on('delete',function(id){
   $('[data-id='+id+']').remove();
});
socket.on('edit',function(bit){
   $('[data-id='+bit.id+'] .bit__text').html(escapeAndNl2br(bit.text));
});

function deleteIfEmpty(bit) {
	if ( $(this).text().length < 1 ) {
		$(this).siblings('.bit__delete').trigger('mousedown');
	}
}

window.onbeforeunload = function() {
	if (Object.keys(editTimeouts).length > 0)
		return 'Please wait a short while so we can save your message.';
	else
		return null;
}
