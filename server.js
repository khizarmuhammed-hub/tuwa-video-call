const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// In-memory room storage: roomId -> Map<socketId, {id, name}>
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('join-room', ({ roomId, userName }) => {
    if (!roomId || !userName) {
      socket.emit('error', { message: 'Room ID and Name are required' });
      return;
    }

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId);
    const userInfo = { 
      id: socket.id, 
      name: userName.trim().substring(0, 30) || 'Guest' 
    };
    room.set(socket.id, userInfo);

    // Send list of existing participants to the newly joined user
    const existingUsers = Array.from(room.values()).filter(u => u.id !== socket.id);
    socket.emit('room-users', existingUsers);

    // Notify all other participants about the new user
    socket.to(roomId).emit('user-joined', userInfo);

    console.log(`👤 ${userInfo.name} joined room "${roomId}" (${room.size} total)`);
  });

  // WebRTC Signaling - Forward messages to specific peer
  socket.on('offer', ({ to, offer, fromName }) => {
    if (to) {
      socket.to(to).emit('offer', { 
        from: socket.id, 
        offer, 
        fromName: fromName || 'Anonymous' 
      });
    }
  });

  socket.on('answer', ({ to, answer }) => {
    if (to) {
      socket.to(to).emit('answer', { from: socket.id, answer });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    if (to && candidate) {
      socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
    }
  });

  // Real-time Chat
  socket.on('chat-message', ({ roomId, message }) => {
    if (!roomId || !message) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const sender = room.get(socket.id) || { name: 'Anonymous' };
    const chatData = {
      fromName: sender.name,
      message: message.trim().substring(0, 500),
      timestamp: new Date().toISOString()
    };

    io.to(roomId).emit('chat-message', chatData);
  });

  // Sync media mute/unmute state across participants (for UI indicators)
  socket.on('media-state-change', ({ roomId, type, enabled }) => {
    if (!roomId) return;
    socket.to(roomId).emit('media-state-change', {
      userId: socket.id,
      type,      // 'audio' or 'video'
      enabled
    });
  });

  // Handle leaving room
  function handleLeave() {
    for (const [roomId, room] of rooms.entries()) {
      if (room.has(socket.id)) {
        const user = room.get(socket.id);
        room.delete(socket.id);

        // Notify others
        socket.to(roomId).emit('user-left', { 
          id: socket.id, 
          name: user.name 
        });

        console.log(`👋 ${user.name} left room "${roomId}"`);

        if (room.size === 0) {
          rooms.delete(roomId);
          console.log(`🗑️  Room "${roomId}" closed (empty)`);
        }
        break;
      }
    }
  }

  socket.on('leave-room', handleLeave);

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    handleLeave();
  });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🚀 Zoom Clone Server Started Successfully                ║
║                                                            ║
║   Open in browser: http://localhost:${PORT}                 ║
║                                                            ║
║   Features: Multi-user WebRTC calls, Screen Share, Chat   ║
╚════════════════════════════════════════════════════════════╝
  `);
});
