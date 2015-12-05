'use strict';

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

// Displays a bit
function appendBit(bit,id,focus)
{
	if (typeof focus == 'undefined') focus = false;

	var $bit = $($('.template-bit').html()) // or children.clone
		.attr('data-id',id) // rather than .data() so that we can search for an id using CSS selectors
		.css({top: bit.top, left: bit.left})
		.find('.bit__text')
			.html(escapeAndNl2br(bit.text || ''))
		.end()
		.appendTo('#canvas')
		.draggable({
			handle: ".bit__handle",
			containment: "parent",
			start: function(e) {
				$(this).addClass('being-dragged');
			},
			stop: function(e,ui) { // ou stop comme on veut // @todo foutre ça ailleurs
				$(this).removeClass('being-dragged');
				socket.emit('move',{id: id, left: ui.position.left, top: ui.position.top});
			}
		});

	if (focus) {
		$bit.find('.bit__text').focus();
	}


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

socket.on('catchUp',function(bits) {
	$('.page').removeClass('active');
	$('.page--swarm').addClass('active');
	$.each(bits,function(id,bit){ appendBit(bit,id); });

	$('#canvas').click(function(e){
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
		var relY = e.pageY - parentOffset.top - 27;
		var id = Math.floor(Math.random()*100000); // magic is happening
		appendBit({left: relX, top: relY}, id, true);

		socket.emit('new',{id: id, top:relY, left:relX}); //todo wait before edit ?

	});

	$('#canvas').on('input','.bit__text',function(e){ // todo on input sur bit-text?
			var $bit = $(e.target);
			var id = $bit.closest('.bit').data('id');
			if (typeof(editTimeouts[id]) !== 'undefined')
				clearInterval(editTimeouts[id]);

			editTimeouts[id] = setTimeout(function() {
				var $el_with_linebreaks = $bit.clone().find("br").replaceWith("\n").end();
				var html_content = $el_with_linebreaks.html().replace(/<\/div></g,"</div>\n<");
				var plaintext = jQuery(document.createElement('div')).html(html_content).text();
				socket.emit('edit',{id: id, text: plaintext});
				delete editTimeouts[id];
			},500);
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
});
// @todo encodage
// remove all

function deleteIfEmpty(bit) {
	if ( $(this).text().length < 1 ) {
		socket.emit('delete',$(this).parent().data('id'));
		$(this).parent().remove();
	}
}

window.onbeforeunload = function() {
	if (Object.keys(editTimeouts).length > 0)
		return 'Please wait a short while so we can save your message.';
	else
		return null;
}