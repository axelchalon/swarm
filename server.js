var https = require('https'),
	Datastore = require('nedb');
var fs = require('fs');
var db = new Datastore({ filename: 'data.db', autoload: true });
// var db = {}

// Send index.html to all requests
var app = https.createServer( {
key: fs.readFileSync('/etc/letsencrypt/live/dashpad.me/privkey.pem'),
cert: fs.readFileSync('/etc/letsencrypt/live/dashpad.me/fullchain.pem')
}
);

// Socket.io server listens to our app
var io = require('socket.io').listen(app);

//todo reactive
//user leave => updatecount => broadcast

console.log('listening');
// Emit welcome message on connection
io.sockets.on('connection', function(socket) {

	console.log('CONECTION');

	var roomsJoinedBySocket = [];

	socket.on('disconnect', function() {
	       roomsJoinedBySocket.forEach(room => {
	           io.sockets.adapter.rooms[room] &&
						 io.to(room).emit('connectedUsersCount',io.sockets.adapter.rooms[room].length)
	       });
	});

	socket.on('swarm', function(swarm_name) {
		console.log('SWARM');
		if (swarm_name.length == 0) swarm_name = '/';
		swarm_name = swarm_name.toLowerCase();
		socket.swarm_name = swarm_name;
		socket.join(swarm_name); roomsJoinedBySocket.push(swarm_name);
		io.to(swarm_name).emit('connectedUsersCount',io.sockets.adapter.rooms[swarm_name].length)

		db.find({swarm: swarm_name}, function (err, docs) {
			if (err)
			{
				console.log('CATCH UP ERROR');
				console.log(err);
			}
			else
			{
				var mappedDocs = docs.map(function(obj) { return {top: obj.top, left: obj.left, text: obj.text, id: obj._id}; });
				socket.emit('catchUp',mappedDocs);
			}
		});
	});

  socket.on('new', function(obj) {
	db.insert({swarm: socket.swarm_name, top: obj.top, left: obj.left, text: obj.text || ''}, function(err, newDoc) {
		console.log('insert new');
		socket.broadcast.to(socket.swarm_name).emit('new',{id: newDoc._id, top: newDoc.top, left: newDoc.left, text: newDoc.text});
		socket.emit('tempIdIsId',{temp_id: obj.id, id:newDoc._id});
	});

	// send "is actually id..."
	// client: data-id-temp (généré client) data-id
	// client sends "edit" only once it has the server msg id
  });

  socket.on('move', function(obj) {
	db.update({ _id: obj.id }, { $set: { top: obj.top, left: obj.left} }, {}, function (err) {
		if (err)
		{
			console.log('MOVE ERROR');
			console.log(err);
		}
		else
			socket.broadcast.to(socket.swarm_name).emit('move',{id: obj.id, top: obj.top, left: obj.left});
	});
});

  socket.on('delete', function(id) {
	db.remove({ _id: id }, {}, function (err, numRemoved) {
		if (err)
		{
			console.log('DELETE ERROR');
			console.log(err);
		}
		else
			socket.broadcast.to(socket.swarm_name).emit('delete',id);
	});
  });

  socket.on('edit', function(obj) {
	db.update({ _id: obj.id }, { $set: { text: obj.text} }, {}, function (err) {
		console.log('edit');
		console.log(obj);
		if (err)
		{
			console.log('EDIT ERROR');
			console.log(err);
		}
		else
			socket.broadcast.to(socket.swarm_name).emit('edit',{id: obj.id, text: obj.text});
	});

  });

  socket.on('purge',function() {
      console.log('Attempted purge.');
  });
});

// @todo verif si obj contient left top text etc.

app.listen(1336);
