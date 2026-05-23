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
  console.log(`Conectado: ${socket.id}`);

  socket.on('join-room', ({ roomId, userName, role }) => {
    if (!roomId || !userName) return;
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        moderatorId: socket.id,
        users: [],
        stories: [],
        currentStoryId: null,
        status: 'idle'
      };
      rooms.set(roomId, room);
    }

    let finalName = userName;
    const exists = room.users.some(u => u.name === finalName);
    if (exists) {
      let counter = 1;
      while (room.users.some(u => u.name === `${userName}(${counter})`)) counter++;
      finalName = `${userName}(${counter})`;
    }

    const user = { id: socket.id, name: finalName, role };
    room.users.push(user);
    socket.data.roomId = roomId;
    socket.data.userName = finalName;
    socket.join(roomId);

    io.to(roomId).emit('room-update', sanitizeRoomForUser(room, socket.id));
  });

  socket.on('add-story', ({ roomId, title }) => {
    const room = rooms.get(roomId);
    if (!room || room.moderatorId !== socket.id || !title.trim()) return;
    const newId = room.stories.length > 0 ? Math.max(...room.stories.map(s => s.id)) + 1 : 1;
    room.stories.push({ id: newId, title: title.trim(), votes: [], revealed: false });
    room.currentStoryId = newId;
    room.status = 'voting';
    io.to(roomId).emit('room-update', sanitizeRoomForUser(room, socket.id));
  });

  socket.on('submit-vote', ({ roomId, storyId, value }) => {
    const room = rooms.get(roomId);
    if (!room || room.currentStoryId !== storyId || room.status !== 'voting') return;
    if (!VALID_VOTES.includes(value)) return;
    const story = room.stories.find(s => s.id === storyId);
    if (!story) return;
    const user = room.users.find(u => u.id === socket.id);
    if (!user || user.role !== 'player') return;

    const existing = story.votes.find(v => v.userId === socket.id);
    if (existing) {
      existing.value = value;
    } else {
      story.votes.push({ userId: socket.id, userName: socket.data.userName, value });
    }

    const players = room.users.filter(u => u.role === 'player');
    const allVoted = players.every(p => story.votes.some(v => v.userId === p.id && v.value != null));
    if (allVoted) {
      story.revealed = true;
      room.status = 'revealed';
    }

    room.users.forEach(u => {
      io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
    });
  });

  // Limpiar votos – ahora cualquier usuario puede hacerlo
  socket.on('clear-votes', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'revealed') return; // solo cuando ya se revelaron
    const story = room.stories.find(s => s.id === room.currentStoryId);
    if (story) {
      story.votes = [];
      story.revealed = false;
      room.status = 'voting';
    }
    room.users.forEach(u => {
      io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
    });
  });

  // Expulsar usuario – al expulsar, si todos los jugadores restantes ya votaron, se revela automáticamente
  socket.on('kick-user', ({ roomId, targetUserId }) => {
    const room = rooms.get(roomId);
    if (!room || room.moderatorId !== socket.id) return;
    const targetSocket = io.sockets.sockets.get(targetUserId);
    if (targetSocket) {
      targetSocket.emit('kicked');
      targetSocket.leave(roomId);
      room.users = room.users.filter(u => u.id !== targetUserId);
      if (targetSocket.data.roomId === roomId) {
        targetSocket.data.roomId = null;
        targetSocket.data.userName = null;
      }

      // Después de expulsar, verificar si todos los jugadores ya votaron
      if (room.status === 'voting' && room.currentStoryId != null) {
        const story = room.stories.find(s => s.id === room.currentStoryId);
        if (story) {
          const players = room.users.filter(u => u.role === 'player');
          const allVoted = players.every(p => story.votes.some(v => v.userId === p.id && v.value != null));
          if (allVoted) {
            story.revealed = true;
            room.status = 'revealed';
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

      // Al desconectarse un jugador, también podría revelarse si todos los restantes ya votaron
      if (room.status === 'voting' && room.currentStoryId != null) {
        const story = room.stories.find(s => s.id === room.currentStoryId);
        if (story) {
          const players = room.users.filter(u => u.role === 'player');
          const allVoted = players.every(p => story.votes.some(v => v.userId === p.id && v.value != null));
          if (allVoted) {
            story.revealed = true;
            room.status = 'revealed';
          }
        }
      }

      room.users.forEach(u => {
        io.to(u.id).emit('room-update', sanitizeRoomForUser(room, u.id));
      });
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));