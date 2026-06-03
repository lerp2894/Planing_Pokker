const loginScreen = document.getElementById('login-screen');
const roomScreen = document.getElementById('room-screen');
const joinBtn = document.getElementById('joinBtn');
const userNameInput = document.getElementById('userName');
const roomIdInput = document.getElementById('roomId');
const roleSelect = document.getElementById('role');
const roomTitle = document.getElementById('roomTitle');
const moderatorBadge = document.getElementById('moderatorBadge');
const userList = document.getElementById('userList');
const storyInfo = document.getElementById('storyInfo');
const votingPanel = document.getElementById('votingPanel');
const cardsContainer = document.getElementById('cardsContainer');
const resultsPanel = document.getElementById('resultsPanel');
const summaryAnalytics = document.getElementById('summaryAnalytics');
const averageResult = document.getElementById('averageResult');
const clearVotesBtn = document.getElementById('clearVotesBtn');
const toggleRoleBtn = document.getElementById('toggleRoleBtn');
const moderatorControls = document.getElementById('moderatorControls');
const newStoryInput = document.getElementById('newStoryInput');
const addStoryBtn = document.getElementById('addStoryBtn');
const thresholdInput = document.getElementById('thresholdInput');
const sessionTimer = document.getElementById('sessionTimer');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const toast = document.getElementById('toast');

const pokerTable = document.getElementById('pokerTable');
const tableStatusLabel = document.getElementById('tableStatusLabel');
const tableAverageDisplay = document.getElementById('tableAverageDisplay');

const socket = io();
let currentRoom = null;
let myRole = 'player';
let myName = '';
let selectedCardValue = null;
let sessionStartTime = null;
let timerInterval = null;
let lastClearBy = null;

const FIBONACCI = [1, 2, 3, 5, 8, 13, 20, 40, 100, -1];

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

leaveRoomBtn.addEventListener('click', () => {
  clearSavedSession();
  stopTimer();
  socket.disconnect();
  location.reload();
});

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

socket.on('room-update', (room) => {
  if (room.lastClearBy && room.lastClearBy !== lastClearBy) {
    const cleaner = room.users.find(u => u.id === room.lastClearBy);
    if (cleaner) {
      showToast(`🧹 Votos limpiados por ${cleaner.name}`);
    }
  }
  lastClearBy = room.lastClearBy;
  renderRoom(room);
});

socket.on('kicked', () => {
  clearSavedSession();
  stopTimer();
  alert('Has sido expulsado de la sala.');
  location.reload();
});

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
}

function renderRoom(room) {
  currentRoom = room;
  roomTitle.textContent = room.id;
  
  moderatorBadge.style.display = (room.moderatorId === socket.id) ? 'inline-block' : 'none';
  moderatorBadge.textContent = '👑';

  const me = room.users.find(u => u.id === socket.id);
  if (me) {
    myRole = me.role;
    toggleRoleBtn.textContent = myRole === 'player' ? 'Cambiar a Espectador' : 'Cambiar a Jugador';
  }

  const story = room.stories.find(s => s.id === room.currentStoryId);
  const numericVotes = story ? story.votes.filter(v => v.value !== -1 && v.value != null) : [];
  
  let minValue = null, maxValue = null, diff = 0;
  
  const threshold = room.threshold !== undefined ? room.threshold : parseInt(thresholdInput?.value || 2, 10);
  
  if (thresholdInput) {
    thresholdInput.value = threshold;
  }

  if (numericVotes.length > 0) {
    minValue = Math.min(...numericVotes.map(v => v.value));
    maxValue = Math.max(...numericVotes.map(v => v.value));
    diff = maxValue - minValue;
  }

  userList.innerHTML = '';
  const totalUsers = room.users.length;
  const centerX = 200; 
  const centerY = 200;
  
  const isMobile = window.innerWidth <= 768;
  const baseRadius = isMobile ? 100 : 135;
  
  room.users.forEach((user, index) => {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'player-slot';

    const finalRadius = user.role === 'spectator' ? baseRadius + 35 : baseRadius;

    const angle = (index / totalUsers) * 2 * Math.PI - Math.PI / 2;
    const x = centerX + finalRadius * Math.cos(angle);
    const y = centerY + finalRadius * Math.sin(angle);
    
    slotDiv.style.left = isMobile ? `${x - 15}px` : `${x}px`;
    slotDiv.style.top = `${y}px`;

    const avatarCircle = document.createElement('div');
    avatarCircle.className = 'avatar';
    
    if (user.role === 'spectator') {
      avatarCircle.classList.add('spectator-avatar');
    } else if (user.id === room.moderatorId) {
      avatarCircle.classList.add('admin-avatar');
    } else {
      const colorClasses = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4'];
      avatarCircle.classList.add(colorClasses[index % colorClasses.length]);
    }

    const initialSpan = document.createElement('span');
    initialSpan.textContent = user.name.charAt(0).toUpperCase();
    avatarCircle.appendChild(initialSpan);

    if (user.id === room.moderatorId) {
      const corona = document.createElement('span');
      corona.className = 'top-badge corona-badge';
      corona.textContent = '👑'; 
      avatarCircle.appendChild(corona);
    }

    if (room.lastClearBy === user.id && room.status !== 'revealed') {
      const escoba = document.createElement('span');
      escoba.className = 'top-badge escoba-badge';
      escoba.textContent = '🧹'; 
      avatarCircle.appendChild(escoba);
    }

    if (room.status === 'revealed' && user.role === 'player') {
      const uVote = story ? story.votes.find(v => v.userId === user.id) : null;
      if (uVote && uVote.value != null && uVote.value !== -1 && diff >= threshold) {
        if (uVote.value === minValue || uVote.value === maxValue) {
          avatarCircle.classList.add('alert-outlier');
          const warningSign = document.createElement('span');
          warningSign.className = 'warning-badge';
          warningSign.textContent = '⚠️'; 
          avatarCircle.appendChild(warningSign);
        }
      }
    }

    const nameLabel = document.createElement('div');
    nameLabel.className = 'player-name';
    nameLabel.textContent = user.role === 'spectator' ? 'Observador' : user.name;
    if (user.role === 'spectator') nameLabel.classList.add('lbl-observador');

    const playedCard = document.createElement('div');
    playedCard.className = 'played-card';
    
    if (user.role === 'player') {
      if (room.status === 'voting') {
        if (user.hasVoted) {
          playedCard.classList.add('has-voted');
          playedCard.textContent = '✓'; 
        } else {
          playedCard.classList.add('waiting');
          playedCard.textContent = '...';
        }
      } else if (room.status === 'revealed') {
        playedCard.classList.add('revealed');
        const userVote = story ? story.votes.find(v => v.userId === user.id) : null;
        if (userVote && userVote.value != null) {
          playedCard.textContent = userVote.value === -1 ? '?' : userVote.value;
        } else {
          playedCard.textContent = '-';
        }
      }
    } else {
      playedCard.classList.add('spectator-tag');
      playedCard.textContent = '👁'; 
    }

    slotDiv.appendChild(avatarCircle);
    slotDiv.appendChild(nameLabel);
    slotDiv.appendChild(playedCard);

    if (room.moderatorId === socket.id && user.id !== socket.id) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'X';
      kickBtn.className = 'kick-btn';
      kickBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`¿Expulsar a ${user.name}?`)) {
          socket.emit('kick-user', { roomId: room.id, targetUserId: user.id });
        }
      });
      slotDiv.appendChild(kickBtn);
    }

    userList.appendChild(slotDiv);
  });

  if (story) {
    const estado = room.status === 'voting' ? 'Votando...' : room.status === 'revealed' ? 'Votos revelados' : 'Sin votacion';
    storyInfo.innerHTML = `<strong>${story.title}</strong><br><span class="status-badge">${estado}</span>`;
  } else {
    storyInfo.textContent = 'No hay historia activa.';
  }

  if (myRole === 'player' && room.status === 'voting') {
    votingPanel.style.display = 'flex';
  } else {
    votingPanel.style.display = 'none';
    if (room.status !== 'voting') {
      selectedCardValue = null;
      document.querySelectorAll('.card-vote.selected').forEach(c => c.classList.remove('selected'));
    }
  }

  if (room.status === 'revealed' && story) {
    resultsPanel.style.display = 'block';
    
    if (numericVotes.length > 0) {
      const avg = numericVotes.reduce((a, b) => a + b.value, 0) / numericVotes.length;
      const formattedAvg = avg.toFixed(1);
      averageResult.textContent = formattedAvg;
      tableStatusLabel.textContent = "Consensus!";
      tableAverageDisplay.textContent = formattedAvg;

      let analyticsHTML = `
        <div class="analytic-item">Umbral establecido: <strong>${threshold}</strong></div>
        <div class="analytic-item">Voto mas bajo: <strong>${minValue}</strong></div>
        <div class="analytic-item">Voto mas alto: <strong>${maxValue}</strong></div>
        <div class="analytic-item ${diff >= threshold ? 'alert-text' : ''}">Diferencia: <strong>${diff}</strong></div>
      `;

      if (diff >= threshold) {
        analyticsHTML += `<div class="alert-box-warning">⚠️ Supera o iguala el umbral establecido de ${threshold}</div>`;
      }
      summaryAnalytics.innerHTML = analyticsHTML;

    } else {
      averageResult.textContent = 'N/A';
      tableStatusLabel.textContent = "Revealed";
      tableAverageDisplay.textContent = '?';
	  summaryAnalytics.innerHTML = `
        <div class="analytic-item">Umbral establecido: <strong>\u2265 ${threshold}</strong></div>
        <div>No hay votos numericos.</div>
      `;
    }
    
    // VISIBILIDAD: Cualquier integrante de la sala ve y puede usar el botón "Repetir"
    clearVotesBtn.style.display = 'block';

  } else {
    resultsPanel.style.display = 'none';
    clearVotesBtn.style.display = 'none';
    tableStatusLabel.textContent = room.status === 'voting' ? 'Votando...' : 'Esperando';
    tableAverageDisplay.textContent = '...';
  }

  if (room.moderatorId === socket.id) {
    moderatorControls.style.display = 'block';
  } else {
    moderatorControls.style.display = 'none';
  }
}

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

  const threshold = parseInt(thresholdInput.value || 2, 10);

  socket.emit('add-story', { 
    roomId: currentRoom.id, 
    title,
    threshold: threshold
  });

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

window.addEventListener('resize', () => {
  if (currentRoom) {
    renderRoom(currentRoom);
  }
});

buildCards();
tryAutoJoin();