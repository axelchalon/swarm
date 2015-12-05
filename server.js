var http = require('http'),
	Datastore = require('nedb');

var db = new Datastore({ filename: 'data.db', autoload: true });

// Send index.html to all requests
var app = http.createServer(function(req, res) {
    res.writeHead(200, 'Nothing here. You\'re on the socket port.');
    res.end();
});

// Socket.io server listens to our app
var io = require('socket.io').listen(app);

// Emit welcome message on connection
io.sockets.on('connection', function(socket) {
    
	db.find({}, function (err, docs) {
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
	
    socket.on('new', function(obj) {
		db.insert({top: obj.top, left: obj.left, text: ''}, function(err, newDoc) {	
			console.log('insert new');
			socket.broadcast.emit('new',{id: newDoc._id, top: newDoc.top, left: newDoc.left, text: newDoc.text});
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
				socket.broadcast.emit('move',{id: obj.id, top: obj.top, left: obj.left});
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
				socket.broadcast.emit('delete',id);
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
				socket.broadcast.emit('edit',{id: obj.id, text: obj.text});
		});
        
    });
    
    socket.on('purge',function() {
        console.log('Attempted purge.');
    });
});

// @todo verif si obj contient left top text etc.

app.listen(1336);