'use strict';

var createStore = Redux.createStore;
var Component = React.Component;

function uniqid() {
	return Math.floor(Math.random()*100000);	
}

var store = createStore( (state, action) => {
	
	console.warn('REDUCER');
	console.log(state,action);
	
	// @todo use {bit: } as param always?
	switch (action.type)
	{
		case 'HYDRATE':
			return Object.assign({}, state, { bits: action.bits.map(bit => Object.assign({}, bit, {id_client: uniqid()})) });
			break;
		case 'CHANGE_SWARM':
			return Object.assign({}, state, { swarmName: action.swarmName });
			break;
		case 'ADD_BIT_CLIENT':
			return Object.assign({}, state, { bits: [...state.bits, action.bit] }); // @todo action.bit !?
			break;
		case 'ADD_BIT_SERVER':
			console.log(action.bit);
			return Object.assign({}, state, { bits: [...state.bits, Object.assign({}, action.bit, {id_client: uniqid()} )] }); // @todo action.bit !?
			break;
		case 'EDIT_BIT_CLIENT':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id_client != action.id_client) ? bit : Object.assign({}, bit, {text: action.text})) });
			break;
		case 'EDIT_BIT_SERVER':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id_server != action.id_server) ? bit : Object.assign({}, bit, {text: action.text})) });
			break;
		case 'MOVE_BIT_CLIENT':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id_client != action.id_client) ? bit : Object.assign({}, bit, {top: action.top, left: action.left})) });
			break;
		case 'MOVE_BIT_SERVER':
			return Object.assign({}, state, { bits: state.bits.map(bit => (bit.id_server != action.id_server) ? bit : Object.assign({}, bit, {top: action.top, left: action.left})) });
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
					store.dispatch({type: 'MOVE_BIT_CLIENT', id_client: that.props.id_client, left: ui.position.left, top: ui.position.top});
					socket.emit('move',{id_server: that.props.id_server, left: ui.position.left, top: ui.position.top}); // @todo store
				}
			});
		
		this.editTimeout = null;
	}
	
	updateContentEditableText() {
		function escapeHTML(str) {
			var div = document.createElement('div');
			div.appendChild(document.createTextNode(str));
			return div.innerHTML;
		};
		
		var newInnerHTML = escapeHTML(this.props.text).replace(/\n/g,'<br>');
		if (this.refs.contentEditable.innerHTML != newInnerHTML) // @todo react should do this
			this.refs.contentEditable.innerHTML = newInnerHTML
	}
	
	componentDidUpdate() {
		this.updateContentEditableText();	
	}
	
	componentDidMount() {
		this.updateContentEditableText();	
	}
	
	render() { // rerender on input because yolo
		
		// don't want to re-render on input
		
		console.log('render');
		
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
			
			/*
			<=>
			if (this.props.id_server != null)
				socket.emit('delete',{id_server: this.props.id_server});*/
		}		
		
		var onInput = function(e) {
			
			var sendTextToServer = function() { // @todo cette fonction ne devrait pas être ici
				
				// @todo send only if not empty (on creation)
				var tempDiv = document.createElement('div');
				tempDiv.innerHTML = this.refs.contentEditable.innerHTML.replace(/<br\/?>/g, '\n');
				var plaintext = tempDiv.textContent;
				
				console.log('plaintext',plaintext)
				
				store.dispatch({type: 'EDIT_BIT_CLIENT', id_client: this.props.id_client, text: plaintext});
				
				if (this.props.id_server == null)
				{
					console.log('no id server yet');
					this.editTimeout = setTimeout(sendTextToServer,500); // @todo accumule!
					return;
				}
				
				console.log('emit');
				socket.emit('edit',{id_server: this.props.id_server, text: plaintext});
			}
			
			if (this.editTimeout !== null)
				clearTimeout(this.editTimeout);
			
			this.editTimeout = setTimeout(sendTextToServer.bind(this),500);
		}
		
		// <div className="bit__text" contentEditable onInput={onInput.bind(this)}>{this.props.text}</div>
		// <textarea className="bit__text" defaultValue={this.props.text} onChange={onInput.bind(this)} />
		
		return (
			<div className="bit" style={{left: this.props.left, top: this.props.top}} onMouseDown={onMouseDown.bind(this)}>
						<div className="bit__handle"></div>
						<div className="bit__delete" title="Supprimer" onClick={onClickDelete.bind(this)}></div>
						<div className="bit__text" contentEditable onInput={onInput.bind(this)} ref="contentEditable"></div>
			</div>
		)
		
		// soit constamment mettre à jour le state sans rerender (moyen perfs, pas d'intérêt)
		// soit mettre à jour le state à l'editTimeout et rerender <--
		// si rerender hors-react, problème de curseur après edittimeout
		// https://github.com/lovasoa/react-contenteditable ?
		
		// readinglist : https://github.com/facebook/react/issues/2533
		
		// @todo quand on edit le même texte à deux ça pète
		
		// textarea auto height https://jsfiddle.net/hmelenok/WM6Gq/ work well https://stackoverflow.com/questions/454202/creating-a-textarea-with-auto-resize/5346855#5346855 also
		// convert to plaintext, ON PASTE ONLY: https://stackoverflow.com/questions/20365465/extract-text-from-html-while-preserving-block-level-element-newlines/20384452#20384452
		// convert to plaintext : https://stackoverflow.com/questions/24408028/html5-contenteditable-div-accept-only-plaintext
		// plaintext-only is a no-no
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
	
	$('.page').removeClass('active');
	$('.page--swarm').addClass('active'); // @todo utility function showPage('swarm');
	
	store.dispatch({type: 'HYDRATE', bits: bits})
	
	socket.on('delete',function(obj){
	   store.dispatch({type: 'DELETE_BIT_SERVER', id_server: obj.id_server});
	});
	
	socket.on('edit',function(bit){
	   store.dispatch({type: 'EDIT_BIT_SERVER', id_server: bit.id_server, text: bit.text});
	});
	
	socket.on('new',function(bit){
	   store.dispatch({type: 'ADD_BIT_SERVER', bit: {id_server: bit.id_server, text: bit.text, left: bit.left, top: bit.top}});
	});
	
	socket.on('tempIdIsId',function(bit){
	   store.dispatch({type: 'SET_BIT_ID_SERVER', id_client: bit.id_client, id_server: bit.id_server});
	});
	
	socket.on('move',function(bit){ // todo store top/left in store?
		store.dispatch({type: 'MOVE_BIT_SERVER', id_server: bit.id_server, top: bit.top, left: bit.left});
	});
	
});
// @todo encodage
/*
function deleteIfEmpty(bit) {
	if ( $(this).text().length < 1 ) {
		$(this).siblings('.bit__delete').click();
	}
}

@todo flags
@todo focus on new
window.onbeforeunload = function() { @todo
	if (Object.keys(editTimeouts).length > 0) // if store.hasNotEditedYet
		return 'Please wait a short while so we can save your message.';
	else
		return null;
}*/


/*	componentDidUpdate() {
		console.log('did update ! RIRAINDEUUUR');
//		this.autoheight();
		$(ReactDOM.findDOMNode(this)).find('.bit__text').val(this.props.text); // in case the server updated the store @todo
	}*/
	/*
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
	}*/
	