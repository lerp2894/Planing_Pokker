const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = new Map();
const VALID_VOTES = [1, 2, 3, 5, 8, 13, 20, 40, 100, -1];

function sanitizeRoomForUser(room, userId) {
  const copy = JSON.parse(JSON.stringify(room));
  if (copy.currentStoryId != null) {
    const story = copy.stories.find(s => s.id === copy.currentStoryId);
    if (story) {
      copy.users = copy.users.map(u => ({
        ...u,
        hasVoted: story.votes.some(v => v.userId === u.id && v.value != null)
      }));
      if (!story.revealed) {
        story.votes = story.votes.map(v => ({
          ...v,
          value: v.userId === userId ? v.value : null
        }));
      }
    }
  }
  return copy;
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userName, role }) => {
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        moderatorId: socket.id,
        status: 'waiting',
        currentStoryId: null,
        stories: [],
        users: [],
        lastClearBy: null,
        threshold: 2
      });
    }

    const room = rooms.get(roomId);
    
    const existingUserIndex = room.users.findIndex(u => u.id === socket.id);
    const userObj = { id: socket.id, name: userName, role: role || 'player' };

    if (existingUserIndex > -1) {
      room.users[existingUserIndex] = userObj;
    } else {
      room.users.push(userObj);
    }

    if (!room.users.some(u => u.id === room.moderatorId)) {
      room.moderatorId = socket.id;
    }

    socket.join(roomId);

    room.users.forEach(u => {
      io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
    });
  });

  socket.on('add-story', ({ roomId, title, threshold }) => {
    const room = rooms.get(roomId);
    if (room && room.moderatorId === socket.id) {
      room.threshold = parseInt(threshold, 10) !== undefined ? parseInt(threshold, 10) : 2;

      const newStory = {
        id: room.stories.length + 1,
        title,
        votes: [],
        revealed: false
      };
      room.stories.push(newStory);
      room.currentStoryId = newStory.id;
      room.status = 'voting';
      room.lastClearBy = null;

      room.users.forEach(u => {
        io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
      });
    }
  });

  socket.on('submit-vote', ({ roomId, storyId, value }) => {
    const room = rooms.get(roomId);
    if (room && room.status === 'voting' && room.currentStoryId === storyId) {
      const story = room.stories.find(s => s.id === storyId);
      if (story && VALID_VOTES.includes(value)) {
        const user = room.users.find(u => u.id === socket.id);
        if (user && user.role === 'player') {
          const existingVote = story.votes.find(v => v.userId === socket.id);
          if (existingVote) {
            existingVote.value = value;
          } else {
            story.votes.push({ userId: socket.id, value });
          }

          const players = room.users.filter(u => u.role === 'player');
          const allVoted = players.length > 0 && players.every(p => story.votes.some(v => v.userId === p.id && v.value != null));
          if (allVoted) {
            story.revealed = true;
            room.status = 'revealed';
            room.lastClearBy = null;
          }
        }
      }

      room.users.forEach(u => {
        io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
      });
    }
  });

  // CUALQUIER USUARIO PUEDE LIMPIAR: Removida la validación estricta de moderador
  socket.on('clear-votes', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      const story = room.stories.find(s => s.id === room.currentStoryId);
      if (story) {
        story.votes = [];
        story.revealed = false;
        room.status = 'voting';
        room.lastClearBy = socket.id;
      }
      room.users.forEach(u => {
        io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
      });
    }
  });

  socket.on('change-role', ({ roomId, newRole }) => {
    const room = rooms.get(roomId);
    if (room) {
      const user = room.users.find(u => u.id === socket.id);
      if (user) {
        user.role = newRole;
        if (newRole === 'spectator' && room.status === 'voting' && room.currentStoryId != null) {
          const story = room.stories.find(s => s.id === room.currentStoryId);
          if (story) {
            const players = room.users.filter(u => u.role === 'player');
            const allVoted = players.length > 0 && players.every(p => story.votes.some(v => v.userId === p.id && v.value != null));
            if (allVoted) {
              story.revealed = true;
              room.status = 'revealed';
              room.lastClearBy = null;
            }
          }
        }
      }
      room.users.forEach(u => {
        io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
      });
    }
  });

  socket.on('kick-user', ({ roomId, targetUserId }) => {
    const room = rooms.get(roomId);
    if (room && room.moderatorId === socket.id && targetUserId !== socket.id) {
      room.users = room.users.filter(u => u.id !== targetUserId);
      io.to(targetUserId).emit('kicked');
      
      if (room.status === 'voting' && room.currentStoryId != null) {
        const story = room.stories.find(s => s.id === room.currentStoryId);
        if (story) {
          const players = room.users.filter(u => u.role === 'player');
          const allVoted = players.length > 0 && players.every(p => story.votes.some(v => v.userId === p.id && v.value != null));
          if (allVoted) {
            story.revealed = true;
            room.status = 'revealed';
            room.lastClearBy = null;
          }
        }
      }

      room.users.forEach(u => {
        io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
      });
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (room) {
      room.users = room.users.filter(u => u.id !== socket.id);
      if (room.users.length === 0) {
        rooms.delete(roomId);
      } else if (room.moderatorId === socket.id) {
        room.moderatorId = room.users[0].id;
      }

      if (room.status === 'voting' && room.currentStoryId != null) {
        const story = room.stories.find(s => s.id === room.currentStoryId);
        if (story) {
          const players = room.users.filter(u => u.role === 'player');
          const allVoted = players.length > 0 && players.every(p => story.votes.some(v => v.userId === p.id && v.value != null));
          if (allVoted) {
            story.revealed = true;
            room.status = 'revealed';
            room.lastClearBy = null;
          }
        }
      }

      if (rooms.has(roomId)) {
        rooms.get(roomId).users.forEach(u => {
          io.to(u.id).emit('room-update', sanitizeRoomForUser(rooms.get(roomId), u.id));
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));