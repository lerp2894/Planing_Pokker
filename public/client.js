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
const sessionTimer = document.getElementById('sessionTimer');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const sidebar = document.getElementById('sidebar');
const toast = document.getElementById('toast');

const socket = io();
let currentRoom = null;
let myRole = 'player';
let myName = '';
let selectedCardValue = null;
let sessionStartTime = null;
let timerInterval = null;
let lastClearBy = null;
let sidebarVisible = true;

// Fibonacci
const FIBONACCI = [1, 2, 3, 5, 8, 13, 20, 40, 100, -1];

// ----- Persistencia de sesi車n -----
function saveSession(roomId, userName, role) {
  sessionStorage.setItem('pokerSession', JSON.stringify({ roomId, userName, role }));
}

function getSavedSession() {
  const saved = sessionStorage.getItem('pokerSession');
  return saved ? JSON.parse(saved) : null;
}

function clearSavedSession() {
  sessionStorage.removeItem('pokerSession');
}

function tryAutoJoin() {
  const session = getSavedSession();
  if (session) {
    loginScreen.classList.remove('active');
    roomScreen.classList.add('active');
    startTimer();
    socket.emit('join-room', { roomId: session.roomId, userName: session.userName, role: session.role });
  } else {
    loginScreen.classList.add('active');
    roomScreen.classList.remove('active');
  }
}

// ----- Bot車n Salir de la sala -----
leaveRoomBtn.addEventListener('click', () => {
  clearSavedSession();
  stopTimer();
  socket.disconnect();
  roomScreen.classList.remove('active');
  loginScreen.classList.add('active');
  userNameInput.value = '';
  roomIdInput.value = '';
  roleSelect.value = 'player';
  location.reload();
});

// ----- Toggle sidebar (responsive) -----
toggleSidebarBtn.addEventListener('click', () => {
  sidebarVisible = !sidebarVisible;
  if (sidebarVisible) {
    sidebar.style.display = 'block';
  } else {
    sidebar.style.display = 'none';
  }
});

function handleSidebarResponsive() {
  if (window.innerWidth <= 768) {
    toggleSidebarBtn.style.display = 'inline-block';
    if (sidebarVisible) {
      sidebar.style.display = 'block';
    } else {
      sidebar.style.display = 'none';
    }
  } else {
    toggleSidebarBtn.style.display = 'none';
    sidebar.style.display = 'block';
  }
}

window.addEventListener('resize', handleSidebarResponsive);
handleSidebarResponsive();

// ----- Construcci車n de cartas -----
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

// ----- Toast -----
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  toast.classList.remove('hidden');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 4000);
}

// ----- Eventos Socket.io -----
socket.on('room-update', (room) => {
  if (room.lastClearBy && room.lastClearBy !== lastClearBy) {
    const cleaner = room.users.find(u => u.id === room.lastClearBy);
    if (cleaner) {
      // Usamos la escoba con escape Unicode
      showToast(`\u{1F9F9} Votos limpiados por ${cleaner.name}`);
    }
  }
  lastClearBy = room.lastClearBy;
  renderRoom(room);
});

socket.on('kicked', () => {
  clearSavedSession();
  stopTimer();
  alert('Has sido expulsado de la sala por el moderador.');
  roomScreen.classList.remove('active');
  loginScreen.classList.add('active');
  location.reload();
});

// ----- Temporizador -----
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function startTimer() {
  sessionStartTime = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (sessionStartTime) {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      sessionTimer.textContent = formatTime(elapsed);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  sessionStartTime = null;
  sessionTimer.textContent = '00:00';
}

// ----- Renderizado de la sala -----
function renderRoom(room) {
  currentRoom = room;
  roomTitle.textContent = room.id;
  moderatorBadge.style.display = (room.moderatorId === socket.id) ? 'inline-block' : 'none';

  const me = room.users.find(u => u.id === socket.id);
  if (me) {
    myRole = me.role;
    toggleRoleBtn.textContent = myRole === 'player' ? 'Cambiar a Espectador' : 'Cambiar a Jugador';
  }

  userList.innerHTML = '';
  room.users.forEach(user => {
    const li = document.createElement('li');
    li.className = 'user-item';

    // Colores seg迆n rol y estado
    if (user.role === 'spectator') {
      li.style.backgroundColor = '#cce5ff';
    } else if (room.status === 'voting' || room.status === 'revealed') {
      li.style.backgroundColor = user.hasVoted ? '#d4edda' : '#f8d7da';
    } else {
      li.style.backgroundColor = '';
    }

    const nameSpan = document.createElement('span');
    const roleLabel = user.role === 'player' ? 'Jugador' : 'Espectador';
    // Corona (U+1F451) en formato seguro
    const corona = user.id === room.moderatorId ? ' \u{1F451}' : '';
    nameSpan.textContent = `${user.name}${corona} (${roleLabel})`;

    // 赤cono de escoba si limpi車 los votos (U+1F9F9)
    if (room.lastClearBy === user.id) {
      const clearIcon = document.createElement('span');
      clearIcon.className = 'clear-icon';
      clearIcon.textContent = '\u{1F9F9}'; // ??
      clearIcon.title = 'Limpi車 los votos';
      nameSpan.appendChild(clearIcon);
    }

    // Bot車n expulsar (X)
    if (room.moderatorId === socket.id && user.id !== socket.id) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'X';
      kickBtn.className = 'kick-btn';
      kickBtn.title = 'Expulsar jugador';
      kickBtn.addEventListener('click', () => {
        if (confirm(`?Expulsar a ${user.name}?`)) {
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
    storyInfo.innerHTML = `<strong>${story.title}</strong> 〞 Estado: ${room.status === 'voting' ? 'Votando...' : room.status === 'revealed' ? 'Votos revelados' : 'Sin votaci車n'}`;
  } else {
    storyInfo.textContent = 'No hay historia activa.';
  }

  // Panel de votaci車n
  if (myRole === 'player' && room.status === 'voting') {
    votingPanel.style.display = 'block';
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

  // Resultados
  if (room.status === 'revealed' && story) {
    resultsPanel.style.display = 'block';
    resultsGrid.innerHTML = '';

    const numericVotes = story.votes.filter(v => v.value !== -1 && v.value != null);
    let minValue = null, maxValue = null;
    if (numericVotes.length > 0) {
      minValue = Math.min(...numericVotes.map(v => v.value));
      maxValue = Math.max(...numericVotes.map(v => v.value));
    }

    const threshold = parseInt(thresholdInput?.value || 2, 10);
    const diff = (minValue !== null && maxValue !== null) ? maxValue - minValue : 0;

    const diffInfo = document.createElement('div');
    diffInfo.className = 'diff-info';
    if (minValue !== null && maxValue !== null && minValue !== maxValue) {
      const minUsers = numericVotes.filter(v => v.value === minValue).map(v => v.userName).join(', ');
      const maxUsers = numericVotes.filter(v => v.value === maxValue).map(v => v.userName).join(', ');
      diffInfo.innerHTML = `M芍s bajo: <strong>${minValue} (${minUsers})</strong> | M芍s alto: <strong>${maxValue} (${maxUsers})</strong> | Diferencia: ${diff}`;
      if (diff > threshold) {
        diffInfo.classList.add('high-diff');
      }
    } else if (minValue !== null && minValue === maxValue) {
      diffInfo.textContent = 'Todos los votos coinciden.';
    } else {
      diffInfo.textContent = 'No hay votos num谷ricos.';
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

  if (room.moderatorId === socket.id) {
    moderatorControls.style.display = 'block';
  } else {
    moderatorControls.style.display = 'none';
  }
}

// ----- Eventos de interfaz -----
joinBtn.addEventListener('click', () => {
  const userName = userNameInput.value.trim();
  const roomId = roomIdInput.value.trim();
  myRole = roleSelect.value;
  if (!userName || !roomId) return alert('Completa todos los campos');
  myName = userName;

  saveSession(roomId, userName, myRole);
  socket.emit('join-room', { roomId, userName, role: myRole });
  loginScreen.classList.remove('active');
  roomScreen.classList.add('active');
  startTimer();
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

toggleRoleBtn.addEventListener('click', () => {
  const newRole = myRole === 'player' ? 'spectator' : 'player';
  socket.emit('change-role', { roomId: currentRoom.id, newRole });
  const session = getSavedSession();
  if (session) {
    session.role = newRole;
    sessionStorage.setItem('pokerSession', JSON.stringify(session));
  }
});

window.addEventListener('beforeunload', () => {
  stopTimer();
  socket.disconnect();
});

// Iniciar comprobaci車n de sesi車n
buildCards();
tryAutoJoin();