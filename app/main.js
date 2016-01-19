'use strict';

var createStore = Redux.createStore;
var Component = React.Component;

var store = createStore( (state, action) => {
	
	console.warn('REDUCER');
	console.log(state,action);
	
	switch (action.type)
	{
		case 'HYDRATE':
			return Object.assign({}, state, { bits: action.bits });
			break;
		case 'CHANGE_SWARM':
			return Object.assign({}, state, { swarmName: action.swarmName });
			break;
		case 'ADD_BIT':
			return Object.assign({}, state, { bits: [...state.bits, action.bit] });
			break;
		case 'EDIT_BIT':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id != action.id) ? bit : Object.assign({}, bit, {text: action.text})) });
			break;
		case 'DELETE_BIT':
			return Object.assign({}, state, { bits: state.bits.filter(bit => (bit.id != action.id)) });
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
					console.log({id: that.props.id, left: ui.position.left, top: ui.position.top});
					socket.emit('move',{id: that.props.id, left: ui.position.left, top: ui.position.top}); // @todo store
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
			console.log(this.lol);
			e.stopPropagation(); // for canvas onMouseDown
			return false;
		};
		
		var onClickDelete = function(e) {
			socket.emit('delete',this.props.id);
			store.dispatch({type: 'DELETE_BIT', id: this.props.id});
		}		
		
		var onInput = function(e) {
			
			
			/*var $bit_message = $(ReactDOM.findDOMNode(this)).find('.bit__text'); // this.refs.text
			var $el_with_linebreaks = $bit_message.clone().find("br").replaceWith("\n").end();
			var html_content = $el_with_linebreaks.html().replace(/<div>/g,"<div>\n");
			var plaintext = jQuery(document.createElement('div')).html(html_content).text();*/

			var plaintext = e.target.value;
			
			store.dispatch({type: 'EDIT_BIT', id: this.props.id, text: plaintext});
			
			var sendTextToServer = function() { // @todo cette fonction ne devrait pas être ici
				if (this.props.id == null)
				{
					this.editTimeout = setTimeout(sendTextToServer,500); // @todo accumule!
					return;
				}
				
				console.log('emit');
				socket.emit('edit',{id: this.props.id, text: plaintext});
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
		var temp_id = Math.floor(Math.random()*100000); // magic is happening
		store.dispatch({type: 'ADD_BIT', bit: { text: '', left: relX, top: relY, id: null, temp_id: temp_id, get_id_promise: 'toto'} });

		// socket.emit('new',{temp_id: id, top:relY, left:relX}); //todo wait before edit ?
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
			<Bit key={bit.id} id={bit.id} text={bit.text} left={bit.left} top={bit.top}/>
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
	$('.page').removeClass('active');
	$('.page--swarm').addClass('active'); // @todo utility function showPage('swarm');
	
	store.dispatch({type: 'HYDRATE', bits: bits})
	console.log(store.getState());
	
	socket.on('delete',function(id){
	   store.dispatch({type: 'DELETE_BIT', id: id});
	});
	
	
	
	socket.on('edit',function(bit){
	   store.dispatch({type: 'EDIT_BIT', id: bit.id, text: bit.text});
	});
	
	/*

	

	
	
	socket.on('tempIdIsId',function(obj){
	   // don't do this: $('[data-tempid='+obj.temp_id+']').attr('data-id',obj.id);
		modifity in store (stateless)
	});
	socket.on('new',function(bit){
	   // don't do this : appendBit({left: bit.left, top: bit.top}, bit.id)
		store push
	});
	socket.on('move',function(bit){ todo store top/left in store?
	   $('[data-id='+bit.id+']').css({top: bit.top, left: bit.left});
		store move id
	});
	*/
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