var redux = require('redux');

function reducer(state, action) {
	switch (action) {
		case 'RECEIVED_ALL_BITS':
			break;
		case 'RECEIVED_NEW_BIT':
		case 'CREATED_BIT':
				return state.concat ...
			break;
		case 'RECEIVED_REPOS_BIT':
		case 'REPOS_BIT':
			break;
		case 'RECEIVED_EDITED_BIT':
		case 'EDIT_BIT':
			break;
		case 'RECEIVED_DELETED_BIT':
		case 'DELETE_BIT':
			break;
	}
}

// est-ce que le store doit s'occuper d'envoyer au serveur ?
// revoir la vidéo...

var MessageStore = redux.createStore(reducer);

Class socketsUtil {
	on receive => dispatch
}




Class View { (subscribes to MessageStore)
	getstate to re-render everything
}