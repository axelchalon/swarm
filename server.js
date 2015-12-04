var http = require('http'),
    fs = require('fs')

// Send index.html to all requests
var app = http.createServer(function(req, res) {
    res.writeHead(200, 'Nothing here. You\'re on the socket port.');
    res.end();
});

// Socket.io server listens to our app
var io = require('socket.io').listen(app);

// If 'bits' is an array and has only one value at index 5, the index 0-4 would be populated by null, which we do not want
var bits = {};

// Emit welcome message on connection
io.sockets.on('connection', function(socket) {
    
    socket.emit('catchUp',bits);
    
    socket.on('new', function(obj) {
        bits[obj.id] = {top: obj.top, left: obj.left, text: ''}
        socket.broadcast.emit('new',obj);
    });
    
    socket.on('move', function(obj) {
        if (typeof bits[obj.id] === 'undefined') return;
        
        bits[obj.id].top = obj.top;
        bits[obj.id].left = obj.left;
        socket.broadcast.emit('move',obj);
    });
    
    socket.on('delete', function(id) {
        if (typeof bits[id] === 'undefined') return;
        
        delete bits[id];
        socket.broadcast.emit('delete',id);
    });
    
    socket.on('edit', function(obj) {
        if (typeof bits[obj.id] === 'undefined') return;
		
        bits[obj.id].text = obj.text;
        socket.broadcast.emit('edit',obj);
    });
    
    socket.on('purge',function() {
        bits = {}; 
    });
});

// @todo verif si obj contient left top text etc.

app.listen(1336);