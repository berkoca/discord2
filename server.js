const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active users and rooms
const users = {};
const rooms = {
  'general': {
    id: 'general',
    name: 'General',
    type: 'text',
    messages: []
  },
  'voice-general': {
    id: 'voice-general',
    name: 'Voice General',
    type: 'voice',
    users: []
  }
};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // User joins with username
  socket.on('join', (username) => {
    users[socket.id] = {
      id: socket.id,
      username,
      room: 'general'
    };
    
    // Join the general text channel by default
    socket.join('general');
    
    // Send the current user info
    socket.emit('user-data', users[socket.id]);
    
    // Send the list of rooms to the user
    socket.emit('room-list', rooms);
    
    // Notify others that a new user has joined
    socket.to('general').emit('user-joined', users[socket.id]);
    
    // Send the list of online users
    io.emit('user-list', Object.values(users));
  });
  
  // User sends a message
  socket.on('send-message', (message) => {
    const user = users[socket.id];
    if (!user) return;
    
    const messageData = {
      id: uuidv4(),
      content: message,
      sender: user.username,
      senderId: socket.id,
      timestamp: Date.now()
    };
    
    // Store the message
    if (rooms[user.room]) {
      if (!rooms[user.room].messages) {
        rooms[user.room].messages = [];
      }
      rooms[user.room].messages.push(messageData);
      
      // Keep only the last 50 messages
      if (rooms[user.room].messages.length > 50) {
        rooms[user.room].messages.shift();
      }
    }
    
    // Broadcast the message to all users in the room
    io.to(user.room).emit('new-message', messageData);
  });
  
  // User joins a room
  socket.on('join-room', (roomId) => {
    const user = users[socket.id];
    if (!user || !rooms[roomId]) return;
    
    // Leave current room
    socket.leave(user.room);
    
    // Join new room
    user.room = roomId;
    socket.join(roomId);
    
    // If it's a voice room, add user to the room's user list
    if (rooms[roomId].type === 'voice') {
      if (!rooms[roomId].users.includes(socket.id)) {
        rooms[roomId].users.push(socket.id);
      }
      
      // Notify others in the voice room
      socket.to(roomId).emit('user-joined-voice', user);
    }
    
    // Send room data to the user
    socket.emit('room-data', {
      room: rooms[roomId],
      users: Object.values(users).filter(u => u.room === roomId)
    });
  });
  
  // WebRTC signaling
  socket.on('voice-signal', ({ userId, signal }) => {
    // Add logging for debugging
    console.log(`Voice signal from ${socket.id} to ${userId} (${signal.type || 'unknown type'})`);
    
    // Check if target user exists
    if (users[userId]) {
      // Ensure signal is valid
      if (!signal) {
        console.error('Invalid signal received');
        socket.emit('voice-error', {
          message: 'Invalid signal format',
          targetId: userId
        });
        return;
      }
      
      // Send the signal to the target user
      io.to(userId).emit('voice-signal', {
        userId: socket.id,
        signal
      });
      
      // Log successful signal delivery
      console.log(`Signal ${signal.type || 'unknown'} delivered to ${userId}`);
    } else {
      // Send error back to sender if target user doesn't exist
      console.error(`Target user ${userId} not found for signaling`);
      socket.emit('voice-error', {
        message: 'User not found or disconnected',
        targetId: userId
      });
    }
  });
  
  // Voice connection status
  socket.on('voice-status', ({ status, roomId }) => {
    if (!users[socket.id] || !rooms[roomId]) return;
    
    // Broadcast voice status to others in the room
    socket.to(roomId).emit('user-voice-status', {
      userId: socket.id,
      status
    });
  });
  
  // User disconnects
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (!user) return;
    
    // Remove user from voice rooms
    Object.values(rooms).forEach(room => {
      if (room.type === 'voice' && room.users) {
        room.users = room.users.filter(id => id !== socket.id);
      }
    });
    
    // Notify others that user has left
    io.emit('user-left', socket.id);
    
    // Remove user from users list
    delete users[socket.id];
    
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create a new text channel
app.post('/api/channels/text', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Channel name is required' });
  }
  
  const id = name.toLowerCase().replace(/\s+/g, '-');
  
  if (rooms[id]) {
    return res.status(400).json({ error: 'Channel already exists' });
  }
  
  rooms[id] = {
    id,
    name,
    type: 'text',
    messages: []
  };
  
  // Notify all connected clients about the new channel
  io.emit('room-created', rooms[id]);
  
  res.status(201).json(rooms[id]);
});

// Create a new voice channel
app.post('/api/channels/voice', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Channel name is required' });
  }
  
  const id = 'voice-' + name.toLowerCase().replace(/\s+/g, '-');
  
  if (rooms[id]) {
    return res.status(400).json({ error: 'Channel already exists' });
  }
  
  rooms[id] = {
    id,
    name,
    type: 'voice',
    users: []
  };
  
  // Notify all connected clients about the new channel
  io.emit('room-created', rooms[id]);
  
  res.status(201).json(rooms[id]);
});
