var Datastore = require('nedb');

var db = new Datastore({ filename: 'data.db', autoload: true });


// Socket.io server listens to our app
var io = require('socket.io').listen(1336);

// Emit welcome message on connection
io.sockets.on('connection', function(socket) {

	socket.on('swarm', function(swarm_name) {
		if (swarm_name.length == 0) swarm_name = '/';
		swarm_name = swarm_name.toLowerCase();
		socket.swarm_name = swarm_name;
		socket.join(swarm_name);
		
		db.find({swarm: swarm_name}, function (err, docs) {
			if (err)
			{
				console.log('CATCH UP ERROR');
				console.log(err);
			}
			else
			{
				console.log('preparing to send catch up');
				var mappedDocs = docs.map(function(obj) { return {top: obj.top, left: obj.left, text: obj.text, id_server: obj._id}; });	
				console.log('sending catch up');
				socket.emit('catchUp',mappedDocs);
			}
		});
	});
			 
    socket.on('new', function(obj) {
		db.insert({swarm: socket.swarm_name, top: obj.top, left: obj.left, text: ''}, function(err, newDoc) {	
			console.log('insert new');
			socket.broadcast.to(socket.swarm_name).emit('new',{id_server: newDoc._id, top: newDoc.top, left: newDoc.left, text: newDoc.text});
			socket.emit('tempIdIsId',{id_client: obj.id_client, id_server:newDoc._id});
		});
		
		// send "is actually id..."
		// client: data-id-temp (généré client) data-id 
		// client sends "edit" only once it has the server msg id 
    });
    
    socket.on('move', function(obj) {		
		db.update({ _id: obj.id_server }, { $set: { top: obj.top, left: obj.left} }, {}, function (err) {
			if (err)
			{
				console.log('MOVE ERROR');
				console.log(err);
			}
			else
				socket.broadcast.to(socket.swarm_name).emit('move',{id_server: obj.id_server, top: obj.top, left: obj.left});
		});
	});
    
    socket.on('delete', function(obj) {
		db.remove({ _id: obj.id_server }, {}, function (err, numRemoved) {
			if (err)
			{
				console.log('DELETE ERROR');
				console.log(err);
			}
			else
				socket.broadcast.to(socket.swarm_name).emit('delete',{id_server: obj.id_server});
		});
    });
    
    socket.on('edit', function(obj) {
		db.update({ _id: obj.id_server }, { $set: { text: obj.text} }, {}, function (err) {
			console.log('edit');
			console.log(obj);
			if (err)
			{
				console.log('EDIT ERROR');
				console.log(err);
			}
			else
				socket.broadcast.to(socket.swarm_name).emit('edit',{id_server: obj.id_server, text: obj.text});
		});
        
    });
});

// @todo verif si obj contient left top text etc.
