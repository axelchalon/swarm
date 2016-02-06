'use strict';

var createStore = Redux.createStore;
var Component = React.Component;

function uniqid() {
	return Math.floor(Math.random()*100000);	
}

var store = createStore( (state, action) => {
	console.warn('REDUCER'); // @todo redux logger?
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
		console.log($el);
		$el.draggable({
				handle: ".bit__handle",
				containment: "parent",
				start: function(e) {
					$(this).addClass('being-dragged');
				},
				stop: function(e,ui) { // ou stop comme on veut // @todo foutre Ã§a ailleurs
					$(this).removeClass('being-dragged');
					// @todo, if we move the bit right after creating it and we release before receiving tempIdIsId, the event won't be sent. work out some sort of editTimeout sytem? use helper functions for both timeouts.
					store.dispatch({type: 'MOVE_BIT_CLIENT', id_client: that.props.id_client, left: ui.position.left, top: ui.position.top});
					// @todo check if not tempId
					socket.emit('move',{id_server: that.props.id_server, left: ui.position.left, top: ui.position.top}); // @todo store
				}
			});
		
		this.editTimeout = null;
		
		this.updateContentEditableText();  
	}
	
	updateContentEditableText() {
		function escapeHTML(str) {
			var div = document.createElement('div');
			div.appendChild(document.createTextNode(str));
			return div.innerHTML;
		};
		
		var newInnerHTML = escapeHTML(this.props.text).replace(/\n/g,'<br>');
		if (this.refs.contentEditable.innerHTML != newInnerHTML) // @todo react should do this
		{
			console.log('update::isdifferent::previous',this.refs.contentEditable.innerHTML)
			console.log('update::isdifferent::new:from:store',newInnerHTML)
			this.refs.contentEditable.innerHTML = newInnerHTML
		}
	}
	
	componentDidUpdate() {
		this.updateContentEditableText();	
	}
	
	render() { // don't want to re-render on input ? but input should be consistent with the visuals! otherwise the other ppl won't see the same thing. @todo !!!
		
		// pour deux markups avec le même rendu, ça fait faire foirer le curseur...
		
		console.log('render bit');
		
		var onMouseDown = function(e){
			e.stopPropagation(); // for canvas onMouseDown
			return false;
		};
		
		var onClickDelete = function(e) {
			store.dispatch({type: 'DELETE_BIT_CLIENT', id_client: this.props.id_client});
			
			if (this.props.id_server != null)
				socket.emit('delete',{id_server: this.props.id_server});
		}		
		
		var onInput = function(e) {
			
			var sendTextToServer = function() { // @todo cette fonction ne devrait pas être ici
				
				console.log('sendtextoserver::innerhtml',this.refs.contentEditable.innerHTML);
				
				// @todo send only if not empty (on creation)
				/*var tempDiv = document.createElement('div');
				tempDiv.innerHTML = this.refs.contentEditable.innerHTML.replace(/<div><br>/g, '<div>').replace(/<br\/?>/g, '\n').replace(/<div>/g, '\n'); // @todo ???
				var plaintext = tempDiv.textContent; // @todo contenteditable is not predictable. newline creates div !?
				*/
				
				// var plaintext = this.refs.contentEditable.innerHTML.replace(/<br\/?>/g, '\n').replace(/<div>/g, '\n'); // @todo ???
				// var plaintext = this.refs.contentEditable.textContent; // @todo contenteditable is not predictable. newline creates div !?
				var tempDiv = document.createElement('div');
				tempDiv.innerHTML = this.refs.contentEditable.innerHTML.replace(/\n/g, '').replace(/<div><br>/g, '<div>').replace(/<br\/?>/g, '\n').replace(/<div>/g, '\n'); // just in case. normally we don't have any <div> at this point
				var plaintext = tempDiv.textContent;
				// @@@
				
				console.log('sendtextoserver::plaintext',plaintext)
				
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

	
/*$('body').on('keydown',' div[contenteditable]', function(e) {
    // trap the return key being pressed
    if (e.keyCode === 13) {
	  console.log('trap'); // @todo ignore this is execcommand inserthtml doesn't exist
      // insert 2 br tags (if only one br tag is inserted the cursor won't go to the next line)
      document.execCommand('insertHTML', false, '<br>');
      // prevent the default behaviour of return key pressed
      return false;
    }
});*/

// or : white-space pre; and enter inserts a \n

$('body').on('keypress','div[contenteditable]', function(event) {

    if (event.which != 13)
        return true;

	console.log('new trap');
    var docFragment = document.createDocumentFragment();

    //add a new line
    /*var newEle = document.createTextNode('\n');
    docFragment.appendChild(newEle);*/

    //add the br, or p, or something else
    var newEle = document.createElement('br');
    docFragment.appendChild(newEle);

    //make the br replace selection
    var range = window.getSelection().getRangeAt(0);
    range.deleteContents();
    range.insertNode(docFragment);

    //create a new range
    range = document.createRange();
    range.setStartAfter(newEle);
    range.collapse(true);

    //make the cursor there
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    return false;
});

function escapeHTML(str) {
	var div = document.createElement('div');
	div.appendChild(document.createTextNode(str));
	return div.innerHTML;
};

function strip(html) {
   var tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return escapeHtml(tmp.textContent||tmp.innerText);
}
  
$('body').on('paste', 'div[contenteditable]', function(e) {
	var $field = $(e.currentTarget);
	if (e.type==='paste') {
	console.log('paste');
		setTimeout(function() {
			
		console.log('original', $field.get(0).innerHTML);
		var newInnerHTML = $field.get(0).innerHTML.replace(/<li|<h1|<h2|<h3|<h4|<h5|<h6|<div|<p/g,'<br><div').replace(/<\/li>|<\/h1>|<\/h2>|<\/h3>|<\/h4>|<\/h5>|<\/h6>|<\/div>|<\/p>/g,'</div>').replace(/<br>/g,'\n'); // convert block elements and br to \n
		console.log('br etc to n', newInnerHTML);
		var stripped_tags = newInnerHTML.replace(/(<([^>]+)>)/ig,''); // strip tags
		console.log('html: stripped tags', stripped_tags);
		var stripped_tags_with_linebreaks = stripped_tags.replace(/\n/g,'<br>'); // conert \n back to <br>
		console.log('html: stripped tags with br', stripped_tags_with_linebreaks);
		$field.html(stripped_tags_with_linebreaks); /*
			$field.html($field.text()); // @todo preserve br's ; but it's an edge case... */
		},0);
	}
});

// @todo plaintext-only only br polyfill sortir ça

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
	