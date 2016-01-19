'use strict';

var createStore = Redux.createStore;
var Component = React.Component;

function uniqid() {
	return Math.floor(Math.random()*100000);	
}

var store = createStore( (state, action) => {
	
	console.warn('REDUCER');
	console.log(state,action);
	
	switch (action.type)
	{
		case 'HYDRATE':
			return Object.assign({}, state, { bits: action.bits.map(bit => Object.assign({}, bit, {id_client: uniqid()})) });
			break;
		case 'CHANGE_SWARM':
			return Object.assign({}, state, { swarmName: action.swarmName });
			break;
		case 'ADD_BIT_CLIENT':
			return Object.assign({}, state, { bits: [...state.bits, action.bit] });
			break;
		case 'ADD_BIT_SERVER':
			return Object.assign({}, state, { bits: [...state.bits, Object.assign({}, action.bit, {id_client: uniqid()} )] });
			break;
		case 'EDIT_BIT_CLIENT':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id_client != action.id_client) ? bit : Object.assign({}, bit, {text: action.text})) });
			break;
		case 'EDIT_BIT_SERVER':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id_server != action.id_server) ? bit : Object.assign({}, bit, {text: action.text})) });
			break;
		case 'DELETE_BIT_CLIENT':
			return Object.assign({}, state, { bits: state.bits.filter(bit => (bit.id_client != action.id_client)) });
			break;
		case 'DELETE_BIT_SERVER':
			return Object.assign({}, state, { bits: state.bits.filter(bit => (bit.id_server != action.id_server)) });
			break
		case 'SET_BIT_ID_SERVER':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id_client != action.id_client) ? bit : Object.assign({}, bit, {id_server: action.id_server})) });
			break;
		default:
			return { bits: [], swarmName: null }
	}

	
});


class Bit extends Component {
	
	componentDidMount() {
		var $el = $(ReactDOM.findDOMNode(this));
		var that = this;
		$el.draggable({
				handle: ".bit__handle",
				containment: "parent",
				start: function(e) {
					$(this).addClass('being-dragged');
				},
				stop: function(e,ui) { // ou stop comme on veut // @todo foutre Ã§a ailleurs
					$(this).removeClass('being-dragged');
					// @todo, if we move the bit right after creating it and we release before receiving tempIdIsId, the event won't be sent. work out some sort of editTimeout sytem? use helper functions for both timeouts.
					// @todo check if not tempId
					console.log(that.props);
					socket.emit('move',{id_server: that.props.id_server, left: ui.position.left, top: ui.position.top}); // @todo store
				}
			});
		
		this.editTimeout = null;
  		this.autoheight();
	}
	
	componentDidUpdate() {
		this.autoheight();
	}
	
	autoheight () {
		var $el = $(ReactDOM.findDOMNode(this)).find('.bit__text')
		if (!$el.prop('scrollTop')) {
			do {
				var b = $el.prop('scrollHeight');
				var h = $el.height();
				$el.height(h - 5);
			}
			while (b && (b != $el.prop('scrollHeight')));
		};
		$el.height($el.prop('scrollHeight') + 20);
	}
	
	
	render() { // rerender on input because yolo
		
		// don't want to re-render on input
		
		var onMouseDown = function(e){
			e.stopPropagation(); // for canvas onMouseDown
			return false;
		};
		
		var onClickDelete = function(e) {
			
			store.dispatch({type: 'DELETE_BIT_CLIENT', id_client: this.props.id_client});
			
			if (this.props.id_server == null)
			{
				console.log('No server id, passing.')
				return;
			}
			
			socket.emit('delete',{id_server: this.props.id_server});
		}		
		
		var onInput = function(e) {
			
			
			/*var $bit_message = $(ReactDOM.findDOMNode(this)).find('.bit__text'); // this.refs.text
			var $el_with_linebreaks = $bit_message.clone().find("br").replaceWith("\n").end();
			var html_content = $el_with_linebreaks.html().replace(/<div>/g,"<div>\n");
			var plaintext = jQuery(document.createElement('div')).html(html_content).text();*/

			var plaintext = e.target.value;
			
			store.dispatch({type: 'EDIT_BIT_CLIENT', id_client: this.props.id_client, text: plaintext});
			
			var sendTextToServer = function() { // @todo cette fonction ne devrait pas être ici
				if (this.props.id_server == null)
				{
					console.log('no id server yet');
					this.editTimeout = setTimeout(sendTextToServer,500); // @todo accumule!
					return;
				}
				
				console.log('emit');
				socket.emit('edit',{id_server: this.props.id_server, text: plaintext});
			}
			
			console.log('this.editTimeout avant', this.editTimeout)
			
			if (this.editTimeout !== null) // https://jsperf.com/null-check-cleartimeout-vs-cleartimeout-null
				clearTimeout(this.editTimeout);
			
			console.log('this.editTimeout après', this.editTimeout)
			console.log(this);
			this.editTimeout = setTimeout(sendTextToServer.bind(this),500);
		}
		
		// <div className="bit__text" contentEditable onInput={onInput.bind(this)}>{this.props.text}</div>
		
		// todo utiliser contenteditable à la place cf stackoverflow react contenteditable onchange
		// todo nl2br sur this.props.text (ou css pre)
		return (
			<div className="bit" style={{left: this.props.left, top: this.props.top}} onMouseDown={onMouseDown.bind(this)}>
						<div className="bit__handle"></div>
						<div className="bit__delete" title="Supprimer" onClick={onClickDelete.bind(this)}></div>
						<textarea className="bit__text" value={this.props.text} onChange={onInput.bind(this)} />
			</div>
		)
	}
}

const Canvas = (props) => {
	
	var roomDisplayName = store.getState().swarmName || 'swarm';

	var onMouseDown = function(e){
		/*if( e.target !== this )
			return;*/
		
		console.log(this);
		console.log(e.target);

		var parentOffset = $(e.target).offset();
		var relX = e.pageX - parentOffset.left;
		var relY = e.pageY - parentOffset.top - 5;
		
		// dans l'action "createBit"
		var id_client = uniqid()
		store.dispatch({type: 'ADD_BIT_CLIENT', bit: { text: '', id_client: id_client, left: relX, top: relY, id_server: null} });
		console.warn(store.getState());
		socket.emit('new',{id_client: id_client, top:relY, left:relX}); //todo wait before edit ?
		return false;
	};
	
	// to add:
	// todo
	
	// either multiple keys ==> same component
	
	// probably this:
	// OR key is client-side ==> bit.client_id ; bit.server_id (always use client_id (key) except for socket)
	// but then, on edit => bit_id is client_id ? (client edit) or server_id ? (server edit)
	// then, need separate actions... a bit of a pain in the neck. EDIT_SERVER, EDIT_CLIENT...
	
	// "react key waiting for server"
	// "react key from server"
	// "react assign key later"
	
	// shouldComponentUpdate <-- (conenteditable, nochange/nochangerequest)
	
	return (
	<div id="canvas" onMouseDown={onMouseDown}>
		<h1 className="swarm-name">{roomDisplayName}</h1>
		{store.getState().bits.map( bit => 
			<Bit key={bit.id_client} id_client={bit.id_client} id_server={bit.id_server} text={bit.text} left={bit.left} top={bit.top}/>
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
	
	var roomName = window.location.href.match(/\/([^/]+)$/);
	if (roomName == null) roomName = '';
	else roomName = roomName[1];
	store.dispatch({type: 'CHANGE_SWARM', swarmName: roomName})
	
	socket.emit('swarm',roomName);
	
	var room_display_name = roomName.length == 0 ? 'swarm' : roomName; // modif le store
	
	
	
	const render = () => {
		ReactDOM.render(
		<Canvas/>,
		document.querySelector('.swarm__app')
		)
	};
	
	store.subscribe(render);
	render();
	
});



socket.on('catchUp',function(bits) {
	
	console.log('caught up');
	$('.page').removeClass('active');
	$('.page--swarm').addClass('active'); // @todo utility function showPage('swarm');
	
	store.dispatch({type: 'HYDRATE', bits: bits})
	console.log(store.getState());
	
	socket.on('delete',function(obj){
	   store.dispatch({type: 'DELETE_BIT_SERVER', id_server: obj.id_server});
	});
	
	
	
	socket.on('edit',function(bit){
	   store.dispatch({type: 'EDIT_BIT_SERVER', id_server: bit.id_server, text: bit.text});
	});
	
	socket.on('new',function(bit){
	   store.dispatch({type: 'ADD_BIT_SERVER', id_server: bit.id_server, text: bit.text, left: bit.left, top: bit.top});
	});
	
	socket.on('tempIdIsId',function(bit){
	   store.dispatch({type: 'SET_BIT_ID_SERVER', id_client: bit.id_client, id_server: bit.id_server});
	});
	
	socket.on('move',function(bit){ // todo store top/left in store?
		// @todo
	
	   // $('[data-id='+bit.id+']').css({top: bit.top, left: bit.left});
	   // store.dispatch({type: 'MOVE_BIT_SERVER', id_server: bit.id_server, text: bit.text});
	});
	
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