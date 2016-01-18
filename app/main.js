var createStore = Redux.createStore;

var BitStore = createStore( (state, action) => {
	
	console.warn('REDUCER');
	console.log(state,action);
	
	if (action.type == 'HYDRATE')
		{
			return { bits: action.bits }
		}
	
	return {
		bits: [
			{text: 'abc', id: 1},
			{text: 'def', id: 2}
		]
	};
});


const Bit = (props) => {
	return (
	<div className="bit">
				<div className="bit__handle"></div>
				<div className="bit__delete" title="Supprimer"></div>
				<div className="bit__text" contentEditable>{props.text}</div>
	</div>
	)
}

const Canvas = (props) => {
	return (
	<div id="canvas">
		<h1 className="swarm-name">{props.roomDisplayName}</h1>
		{BitStore.getState().bits.map( bit => 
			<Bit key={bit.id} text={bit.text}/>
		)}
	</div>
	);
}









if (location.hostname == 'swarm.ovh')
	var socket = io.connect('http://141.138.157.211:1336');
else
	var socket = io.connect('http://127.0.0.1:1336');


// @todo gérer les pages avec component react
socket.on('connect_error', function(e) {
	$('.page').removeClass('active');
	$('.page--internal-error').addClass('active');
});

socket.on('connect', function() { // FSM pour éviter les bugs? refresh quand re-connect?
	
	var room_name = window.location.href.match(/\/([^/]+)$/);
	if (room_name == null) room_name = '';
	else room_name = room_name[1];
	
	socket.emit('swarm',room_name);
	
	var room_display_name = room_name.length == 0 ? 'swarm' : room_name; // modif le store
	
	
	const render = () => {
		ReactDOM.render(
		<Canvas roomDisplayName={room_display_name} />,
		document.querySelector('.swarm__app')
		)
	};
	
	BitStore.subscribe(render);
	render();
	
});



socket.on('catchUp',function(bits) {
	$('.page').removeClass('active');
	$('.page--swarm').addClass('active'); // @todo utility function showPage('swarm');
	
	console.warn('CATCHUP, DISPATCH HYDRATE');
	BitStore.dispatch({type: 'HYDRATE', bits: bits})
	console.log(BitStore.getState());
	
	/*$.each(bits,function(i,bit){ appendBit({left: bit.left, top: bit.top, text: bit.text},bit.id); });

	// tout ça dans elm react canvas
	$('#canvas').on('mousedown',function(e){
		if( e.target !== this )
			return;

		var parentOffset = $(this).offset();
		var relX = e.pageX - parentOffset.left;
		var relY = e.pageY - parentOffset.top - 5;
		
		// dans l'action "createBit"
		var id = Math.floor(Math.random()*100000); // magic is happening
		store.push({left: relX, top: relY, temp_id: xx, get_id_promise: newPromise focus: true});

		socket.emit('new',{temp_id: id, top:relY, left:relX}); //todo wait before edit ?
		return false;
	});

	
	
	socket.on('tempIdIsId',function(obj){
	   // don't do this: $('[data-tempid='+obj.temp_id+']').attr('data-id',obj.id);
		modifity in store (stateless)
	});
	socket.on('new',function(bit){
	   // don't do this : appendBit({left: bit.left, top: bit.top}, bit.id)
		store push
	});
	socket.on('move',function(bit){
	   $('[data-id='+bit.id+']').css({top: bit.top, left: bit.left});
		store move id
	});
	socket.on('delete',function(id){
	   $('[data-id='+id+']').remove();
		store remove
	});
	socket.on('edit',function(bit){
	   $('[data-id='+bit.id+'] .bit__text').html(escapeAndNl2br(bit.text));
		store edit
	});*/
});
// @todo encodage
/*
function deleteIfEmpty(bit) {
	if ( $(this).text().length < 1 ) {
		$(this).siblings('.bit__delete').click();
	}
}

window.onbeforeunload = function() {
	if (Object.keys(editTimeouts).length > 0) // if store.hasNotEditedYet
		return 'Please wait a short while so we can save your message.';
	else
		return null;
}*/


/*
Since JSX is JavaScript, identifiers such as class and for are discouraged as XML attribute names. Instead, React DOM components
expect DOM property names like className and htmlFor, respectively.
*/