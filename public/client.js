const loginScreen = document.getElementById('login-screen');
const roomScreen = document.getElementById('room-screen');
const joinBtn = document.getElementById('joinBtn');
const userNameInput = document.getElementById('userName');
const roomIdInput = document.getElementById('roomId');
const roleSelect = document.getElementById('role');
const roomTitle = document.getElementById('roomTitle');
const moderatorBadge = document.getElementById('moderatorBadge');
const userList = document.getElementById('userList');
const userCount = document.getElementById('userCount');
const storyInfo = document.getElementById('storyInfo');
const votingPanel = document.getElementById('votingPanel');
const cardsContainer = document.getElementById('cardsContainer');
const resultsPanel = document.getElementById('resultsPanel');
const resultsGrid = document.getElementById('resultsGrid');
const averageResult = document.getElementById('averageResult');
const clearVotesBtn = document.getElementById('clearVotesBtn');
const toggleRoleBtn = document.getElementById('toggleRoleBtn');
const moderatorControls = document.getElementById('moderatorControls');
const newStoryInput = document.getElementById('newStoryInput');
const addStoryBtn = document.getElementById('addStoryBtn');
const thresholdInput = document.getElementById('thresholdInput');

const socket = io();
let currentRoom = null;
let myRole = 'player';   // se actualizará al recibir room-update
let myName = '';
let selectedCardValue = null;

const FIBONACCI = [1, 2, 3, 5, 8, 13, 20, 40, 100, -1];

function buildCards() {
  cardsContainer.innerHTML = '';
  FIBONACCI.forEach(value => {
    const card = document.createElement('div');
    card.className = 'card-vote';
    card.textContent = value === -1 ? '?' : value;
    card.dataset.value = value;
    card.addEventListener('click', () => selectCard(value, card));
    cardsContainer.appendChild(card);
  });
}

function selectCard(value, cardElement) {
  document.querySelectorAll('.card-vote.selected').forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');
  selectedCardValue = value;
  if (currentRoom && currentRoom.currentStoryId != null) {
    socket.emit('submit-vote', {
      roomId: currentRoom.id,
      storyId: currentRoom.currentStoryId,
      value
    });
  }
}

socket.on('room-update', (room) => {
  renderRoom(room);
});

socket.on('kicked', () => {
  alert('Has sido expulsado de la sala por el moderador.');
  roomScreen.classList.remove('active');
  loginScreen.classList.add('active');
  location.reload();
});

function renderRoom(room) {
  currentRoom = room;
  roomTitle.textContent = room.id;
  moderatorBadge.style.display = (room.moderatorId === socket.id) ? 'inline-block' : 'none';

  // Actualizar mi rol según el servidor
  const me = room.users.find(u => u.id === socket.id);
  if (me) {
    myRole = me.role;
    // Actualizar texto del botón de cambio de rol
    toggleRoleBtn.textContent = myRole === 'player' ? 'Cambiar a Espectador' : 'Cambiar a Jugador';
  }

  // Lista de usuarios
  userList.innerHTML = '';
  room.users.forEach(user => {
    const li = document.createElement('li');
    li.className = 'user-item';

    // Color según rol y estado de votación
    if (user.role === 'spectator') {
      li.style.backgroundColor = '#cce5ff'; // azul bajito
    } else if (room.status === 'voting' || room.status === 'revealed') {
      li.style.backgroundColor = user.hasVoted ? '#d4edda' : '#f8d7da'; // verde / rojo
    } else {
      li.style.backgroundColor = ''; // idle
    }

    const nameSpan = document.createElement('span');
    const roleLabel = user.role === 'player' ? 'Jugador' : 'Espectador';
    nameSpan.textContent = user.name + (user.id === room.moderatorId ? ' 👑' : '') + ` (${roleLabel})`;

    if (room.moderatorId === socket.id && user.id !== socket.id) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'X';
      kickBtn.className = 'kick-btn';
      kickBtn.title = 'Expulsar jugador';
      kickBtn.addEventListener('click', () => {
        if (confirm(`¿Expulsar a ${user.name}?`)) {
          socket.emit('kick-user', { roomId: room.id, targetUserId: user.id });
        }
      });
      li.appendChild(nameSpan);
      li.appendChild(kickBtn);
    } else {
      li.appendChild(nameSpan);
    }

    userList.appendChild(li);
  });
  userCount.textContent = room.users.length;

  // Historia actual
  const story = room.stories.find(s => s.id === room.currentStoryId);
  if (story) {
    storyInfo.innerHTML = `<strong>${story.title}</strong> — Estado: ${room.status === 'voting' ? 'Votando...' : room.status === 'revealed' ? 'Votos revelados' : 'Sin votación'}`;
  } else {
    storyInfo.textContent = 'No hay historia activa.';
  }

  // Panel de votación (solo jugadores en estado voting)
  if (myRole === 'player' && room.status === 'voting') {
    votingPanel.style.display = 'block';
    // Mantener selección si ya votó
    if (story && selectedCardValue != null) {
      const existingVote = story.votes.find(v => v.userId === socket.id);
      if (existingVote && existingVote.value != null) {
        const cards = document.querySelectorAll('.card-vote');
        cards.forEach(c => {
          c.classList.remove('selected');
          if (Number(c.dataset.value) === existingVote.value) {
            c.classList.add('selected');
            selectedCardValue = existingVote.value;
          }
        });
      }
    }
  } else {
    votingPanel.style.display = 'none';
    if (room.status !== 'voting') selectedCardValue = null;
  }

  // Resultados y botón de limpiar
  if (room.status === 'revealed' && story) {
    resultsPanel.style.display = 'block';
    resultsGrid.innerHTML = '';

    const numericVotes = story.votes.filter(v => v.value !== -1 && v.value != null);
    let minValue = null, maxValue = null;
    if (numericVotes.length > 0) {
      minValue = Math.min(...numericVotes.map(v => v.value));
      maxValue = Math.max(...numericVotes.map(v => v.value));
    }

    const threshold = parseInt(thresholdInput?.value || 0, 10);
    const diff = (minValue !== null && maxValue !== null) ? maxValue - minValue : 0;

    const diffInfo = document.createElement('div');
    diffInfo.className = 'diff-info';
    if (minValue !== null && maxValue !== null && minValue !== maxValue) {
      const minUsers = numericVotes.filter(v => v.value === minValue).map(v => v.userName).join(', ');
      const maxUsers = numericVotes.filter(v => v.value === maxValue).map(v => v.userName).join(', ');
      diffInfo.innerHTML = `Más bajo: <strong>${minValue} (${minUsers})</strong> | Más alto: <strong>${maxValue} (${maxUsers})</strong> | Diferencia: ${diff}`;
      if (diff > threshold) {
        diffInfo.classList.add('high-diff');
      }
    } else if (minValue !== null && minValue === maxValue) {
      diffInfo.textContent = 'Todos los votos coinciden.';
    } else {
      diffInfo.textContent = 'No hay votos numéricos.';
    }

    story.votes.forEach(v => {
      const div = document.createElement('div');
      div.className = 'vote-card';
      if (v.value !== -1 && v.value != null && diff > threshold) {
        if (v.value === minValue || v.value === maxValue) {
          div.style.backgroundColor = '#cce5ff';
          div.style.border = '2px solid #0066cc';
          div.style.animation = 'selectPop 0.4s ease';
        }
      }
      div.innerHTML = `<div class="name">${v.userName}</div><div class="value">${v.value === -1 ? '?' : v.value}</div>`;
      resultsGrid.appendChild(div);
    });

    if (numericVotes.length > 0) {
      const avg = numericVotes.reduce((a, b) => a + b.value, 0) / numericVotes.length;
      averageResult.textContent = avg.toFixed(1);
    } else {
      averageResult.textContent = 'N/A';
    }

    const oldDiff = resultsPanel.querySelector('.diff-info');
    if (oldDiff) oldDiff.remove();
    resultsPanel.appendChild(diffInfo);

    clearVotesBtn.style.display = 'block';
  } else {
    resultsPanel.style.display = 'none';
    clearVotesBtn.style.display = 'none';
  }

  // Controles de moderador
  if (room.moderatorId === socket.id) {
    moderatorControls.style.display = 'block';
  } else {
    moderatorControls.style.display = 'none';
  }
}

// Eventos
joinBtn.addEventListener('click', () => {
  const userName = userNameInput.value.trim();
  const roomId = roomIdInput.value.trim();
  myRole = roleSelect.value;
  if (!userName || !roomId) return alert('Completa todos los campos');
  myName = userName;
  socket.emit('join-room', { roomId, userName, role: myRole });
  loginScreen.classList.remove('active');
  roomScreen.classList.add('active');
});

addStoryBtn.addEventListener('click', () => {
  const title = newStoryInput.value.trim();
  if (!title) return;
  socket.emit('add-story', { roomId: currentRoom.id, title });
  newStoryInput.value = '';
});

clearVotesBtn.addEventListener('click', () => {
  socket.emit('clear-votes', { roomId: currentRoom.id });
});

// Cambiar rol
toggleRoleBtn.addEventListener('click', () => {
  const newRole = myRole === 'player' ? 'spectator' : 'player';
  socket.emit('change-role', { roomId: currentRoom.id, newRole });
  // El servidor actualizará el estado y nos enviará room-update
});

buildCards();