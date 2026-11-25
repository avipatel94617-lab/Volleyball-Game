const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const p1ScoreEl = document.getElementById("p1Score");
const p2ScoreEl = document.getElementById("p2Score");
const statusTextEl = document.getElementById("statusText");
const restartBtn = document.getElementById("restartBtn");
const pythonStatsEl = document.getElementById("pythonStats");
const touchButtons = document.querySelectorAll("[data-control]");

// Yahan apne PUBLIC folder mein rakhi hui song files ke naam/path daalein
const PLAYLIST = [
  { title: "Track 1 (song1.mp3)", src: "song1.mp3" },
  { title: "Track 2 (song2.mp3)", src: "song2.mp3" },
  { title: "Track 3 (song3.mp3)", src: "song3.mp3" },
  { title: "Track 4 (song4.mp3)", src: "song4.mp3" },
  { title: "Track 5 (song4.mp3)", src: "song4.mp3" },
 
  
];

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = HEIGHT - 55;
const GRAVITY = 0.45;
const WIN_SCORE = 5;

const net = {
  x: WIDTH / 2 - 5,
  y: GROUND_Y - 120,
  width: 10,
  height: 120
};

const player1 = {
  x: 160,
  y: GROUND_Y,
  vx: 0,
  vy: 0,
  radius: 26,
  speed: 4.6,
  jumpForce: -11.5,
  color: "#ef4444",
  score: 0,
  onGround: true
};

const player2 = {
  x: WIDTH - 160,
  y: GROUND_Y,
  vx: 0,
  vy: 0,
  radius: 26,
  speed: 4.6,
  jumpForce: -11.5,
  color: "#3b82f6",
  score: 0,
  onGround: true
};

const ball = {
  x: WIDTH / 2,
  y: 120,
  vx: 3.5,
  vy: -2,
  radius: 14,
  color: "#facc15"
};

const keys = {};
const touchState = {
  "p1-left": false,
  "p1-right": false,
  "p1-jump": false,
  "p2-left": false,
  "p2-right": false,
  "p2-jump": false
};

let matchOver = false;
let resultSent = false;

// --- Live Multiplayer Config (?server=...&room=...) ---
const urlParams = new URLSearchParams(window.location.search);
const serverParam = urlParams.get("server");
const roomParam = urlParams.get("room") || "voliboll-room-1";
const isLocalOrigin =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const liveServerUrl = serverParam || (isLocalOrigin ? window.location.origin : "");

let socket = null;
let isOnlineMode = false;
let myRole = null; // "p1" | "p2" | "spectator"
let lastSentInputKey = "";

function applyServerState(state) {
  if (!state) return;

  if (state.player1) {
    player1.x = state.player1.x;
    player1.y = state.player1.y;
    player1.vx = state.player1.vx || 0;
    player1.vy = state.player1.vy || 0;
    player1.score = state.player1.score || 0;
  }

  if (state.player2) {
    player2.x = state.player2.x;
    player2.y = state.player2.y;
    player2.vx = state.player2.vx || 0;
    player2.vy = state.player2.vy || 0;
    player2.score = state.player2.score || 0;
  }

  if (state.ball) {
    ball.x = state.ball.x;
    ball.y = state.ball.y;
    ball.vx = state.ball.vx || 0;
    ball.vy = state.ball.vy || 0;
  }

  matchOver = Boolean(state.matchOver);
  p1ScoreEl.textContent = String(player1.score);
  p2ScoreEl.textContent = String(player2.score);

  if (state.statusText) {
    statusTextEl.textContent = state.statusText;
  }
  if (state.pythonMessage) {
    pythonStatsEl.textContent = `Python Engine: ${state.pythonMessage}`;
  }
}

function initOnlineMultiplayer(targetUrl, roomId) {
  if (!targetUrl) {
    statusTextEl.textContent = "Offline/Local Mode (Add ?server=URL&room=ID for Live Play)";
    return;
  }

  const startSocket = () => {
    if (typeof window.io !== "function") {
      statusTextEl.textContent = "Socket.io client not loaded; running Local Mode";
      return;
    }

    isOnlineMode = true;
    statusTextEl.textContent = `Connecting to Room: ${roomId}...`;

    socket = window.io(targetUrl, {
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      socket.emit("join-room", { room: roomId });
    });

    socket.on("room-assigned", (data) => {
      myRole = data.role;
      const roleLabel =
        myRole === "p1"
          ? "You are Player 1 (Red)"
          : myRole === "p2"
            ? "You are Player 2 (Blue)"
            : "Spectator Mode";
      statusTextEl.textContent = `${roleLabel} | Room: ${roomId}`;
    });

    socket.on("game-state", (state) => {
      applyServerState(state);
    });

    socket.on("disconnect", () => {
      statusTextEl.textContent = "Disconnected from Live Server";
    });
  };

  if (typeof window.io === "function") {
    startSocket();
  } else {
    const script = document.createElement("script");
    script.src = `${targetUrl.replace(/\/+$/, "")}/socket.io/socket.io.js`;
    script.onload = startSocket;
    script.onerror = () => {
      statusTextEl.textContent = "Live server unreachable; running Local Mode";
    };
    document.head.appendChild(script);
  }
}

function getLocalControls() {
  const p1Left = Boolean(keys["KeyA"] || touchState["p1-left"]);
  const p1Right = Boolean(keys["KeyD"] || touchState["p1-right"]);
  const p1Jump = Boolean(keys["KeyW"] || touchState["p1-jump"]);

  const p2Left = Boolean(keys["ArrowLeft"] || touchState["p2-left"]);
  const p2Right = Boolean(keys["ArrowRight"] || touchState["p2-right"]);
  const p2Jump = Boolean(keys["ArrowUp"] || touchState["p2-jump"]);

  return { p1Left, p1Right, p1Jump, p2Left, p2Right, p2Jump };
}

function emitMyOnlineInput() {
  if (!isOnlineMode || !socket || !socket.connected || !myRole) return;

  const c = getLocalControls();
  let payload = null;

  if (myRole === "p1") {
    payload = {
      left: c.p1Left || c.p2Left,
      right: c.p1Right || c.p2Right,
      jump: c.p1Jump || c.p2Jump
    };
  } else if (myRole === "p2") {
    payload = {
      left: c.p2Left || c.p1Left,
      right: c.p2Right || c.p1Right,
      jump: c.p2Jump || c.p1Jump
    };
  }

  if (!payload) return;

  const keyStr = `${payload.left ? 1 : 0}${payload.right ? 1 : 0}${payload.jump ? 1 : 0}`;
  if (keyStr !== lastSentInputKey) {
    lastSentInputKey = keyStr;
    socket.emit("player-input", { room: roomParam, input: payload });
  }
}

// --- Built-in Song Selector & Player (No Manual Upload Needed) ---
const bgAudio = new Audio();
bgAudio.loop = true;
bgAudio.playsInline = true;

let currentTrackIndex = 0;
let songSelectEl = document.getElementById("songSelect");
let toggleSongBtn = document.getElementById("toggleSongBtn");
let songStatusTextEl = document.getElementById("songStatusText");

function createSongUI() {
  const actionButtons = document.querySelector(".action-buttons");

  const oldUploadLabel = document.querySelector('label[for="songFileInput"]');
  const oldUploadInput = document.getElementById("songFileInput");
  if (oldUploadLabel) oldUploadLabel.remove();
  if (oldUploadInput) oldUploadInput.remove();

  if (!songSelectEl && actionButtons) {
    songSelectEl = document.createElement("select");
    songSelectEl.id = "songSelect";
    songSelectEl.setAttribute("aria-label", "Select Song");
    songSelectEl.style.padding = "8px 10px";
    songSelectEl.style.borderRadius = "6px";
    songSelectEl.style.border = "1px solid #475569";
    songSelectEl.style.background = "#1e293b";
    songSelectEl.style.color = "#f8fafc";
    songSelectEl.style.fontWeight = "bold";
    songSelectEl.style.cursor = "pointer";

    PLAYLIST.forEach((track, idx) => {
      const option = document.createElement("option");
      option.value = String(idx);
      option.textContent = track.title;
      songSelectEl.appendChild(option);
    });

    actionButtons.prepend(songSelectEl);
  }

  if (toggleSongBtn) {
    toggleSongBtn.disabled = false;
    toggleSongBtn.textContent = "Play Song";
  }

  if (!songStatusTextEl) {
    const controlsBar = document.querySelector(".controls-bar");
    songStatusTextEl = document.createElement("div");
    songStatusTextEl.id = "songStatusText";
    songStatusTextEl.className = "song-info";
    if (controlsBar && controlsBar.parentNode) {
      controlsBar.insertAdjacentElement("afterend", songStatusTextEl);
    }
  }
}

function loadTrack(index, autoPlay = false) {
  if (!PLAYLIST.length) {
    if (songStatusTextEl) songStatusTextEl.textContent = "PLAYLIST khali hai.";
    return;
  }

  currentTrackIndex = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
  const track = PLAYLIST[currentTrackIndex];

  if (songSelectEl) {
    songSelectEl.value = String(currentTrackIndex);
  }

  bgAudio.src = track.src;
  bgAudio.currentTime = 0;

  if (autoPlay) {
    bgAudio
      .play()
      .then(() => {
        if (toggleSongBtn) toggleSongBtn.textContent = "Pause Song";
        if (songStatusTextEl) {
          songStatusTextEl.textContent = `Playing: ${track.title} (${track.src})`;
        }
      })
      .catch(() => {
        if (toggleSongBtn) toggleSongBtn.textContent = "Play Song";
        if (songStatusTextEl) {
          songStatusTextEl.textContent = `Selected: ${track.title} — "Play Song" par click karein`;
        }
      });
  } else {
    if (toggleSongBtn) toggleSongBtn.textContent = "Play Song";
    if (songStatusTextEl) {
      songStatusTextEl.textContent = `Selected: ${track.title} (${track.src}) — Click "Play Song"`;
    }
  }
}

function togglePlayPauseSong() {
  if (!PLAYLIST.length) return;

  if (!bgAudio.src) {
    loadTrack(currentTrackIndex, false);
  }

  if (bgAudio.paused) {
    bgAudio
      .play()
      .then(() => {
        if (toggleSongBtn) toggleSongBtn.textContent = "Pause Song";
        const track = PLAYLIST[currentTrackIndex];
        if (songStatusTextEl) {
          songStatusTextEl.textContent = `Playing: ${track.title} (${track.src})`;
        }
      })
      .catch(() => {
        const track = PLAYLIST[currentTrackIndex];
        if (songStatusTextEl) {
          songStatusTextEl.textContent = `File "${track.src}" play nahi hui — check karein ki file PUBLIC folder mein hai.`;
        }
      });
  } else {
    bgAudio.pause();
    if (toggleSongBtn) toggleSongBtn.textContent = "Play Song";
    const track = PLAYLIST[currentTrackIndex];
    if (songStatusTextEl) {
      songStatusTextEl.textContent = `Paused: ${track.title}`;
    }
  }
}

bgAudio.addEventListener("error", () => {
  const track = PLAYLIST[currentTrackIndex];
  if (toggleSongBtn) toggleSongBtn.textContent = "Play Song";
  if (songStatusTextEl && track) {
    songStatusTextEl.textContent = `Song file nahi mili: PUBLIC/${track.src} — is naam ki audio file PUBLIC folder mein rakhein.`;
  }
});

createSongUI();
loadTrack(0, false);

if (songSelectEl) {
  songSelectEl.addEventListener("change", (e) => {
    const selectedIdx = Number(e.target.value);
    const shouldAutoPlay = !bgAudio.paused;
    loadTrack(selectedIdx, shouldAutoPlay);
  });
}

if (toggleSongBtn) {
  toggleSongBtn.addEventListener("click", togglePlayPauseSong);
}

// --- Keyboard Controls ---
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  emitMyOnlineInput();
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  emitMyOnlineInput();
});

// --- Multi-Touch & Pointer Controls (Tablet, iPhone & PC) ---
const activePointersByControl = {};

function setControlState(controlName, pointerId, isPressed) {
  if (!activePointersByControl[controlName]) {
    activePointersByControl[controlName] = new Set();
  }

  if (isPressed) {
    activePointersByControl[controlName].add(pointerId);
  } else {
    activePointersByControl[controlName].delete(pointerId);
  }

  const pressedNow = activePointersByControl[controlName].size > 0;
  touchState[controlName] = pressedNow;

  const matchingBtn = document.querySelector(`[data-control="${controlName}"]`);
  if (matchingBtn) {
    matchingBtn.classList.toggle("active", pressedNow);
  }

  emitMyOnlineInput();
}

function clearAllTouchControls() {
  Object.keys(activePointersByControl).forEach((controlName) => {
    activePointersByControl[controlName].clear();
    touchState[controlName] = false;
    const matchingBtn = document.querySelector(`[data-control="${controlName}"]`);
    if (matchingBtn) {
      matchingBtn.classList.remove("active");
    }
  });
  emitMyOnlineInput();
}

touchButtons.forEach((btn) => {
  const controlName = btn.getAttribute("data-control");

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (btn.setPointerCapture) {
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) {
        // Ignore if pointer capture is not supported
      }
    }
    setControlState(controlName, e.pointerId, true);
  });

  const releasePointer = (e) => {
    e.preventDefault();
    setControlState(controlName, e.pointerId, false);
  };

  btn.addEventListener("pointerup", releasePointer);
  btn.addEventListener("pointercancel", releasePointer);
  btn.addEventListener("lostpointercapture", releasePointer);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});

window.addEventListener("blur", clearAllTouchControls);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearAllTouchControls();
});

function resetBall(servingToLeft = true) {
  ball.x = servingToLeft ? WIDTH * 0.28 : WIDTH * 0.72;
  ball.y = 130;
  ball.vx = servingToLeft ? 3.2 : -3.2;
  ball.vy = -2.5;
}

function restartMatch() {
  if (isOnlineMode && socket && socket.connected) {
    socket.emit("restart-match", { room: roomParam });
    return;
  }

  player1.score = 0;
  player2.score = 0;
  player1.x = 160;
  player1.y = GROUND_Y;
  player1.vx = 0;
  player1.vy = 0;
  player2.x = WIDTH - 160;
  player2.y = GROUND_Y;
  player2.vx = 0;
  player2.vy = 0;
  matchOver = false;
  resultSent = false;
  p1ScoreEl.textContent = "0";
  p2ScoreEl.textContent = "0";
  statusTextEl.textContent = "Match in Progress";
  pythonStatsEl.textContent = "Play to 5 points to record match stats...";
  resetBall(true);
}

restartBtn.addEventListener("click", restartMatch);

function updatePlayer(player, leftPressed, rightPressed, jumpPressed, minX, maxX) {
  player.vx = 0;
  if (leftPressed) player.vx = -player.speed;
  if (rightPressed) player.vx = player.speed;

  if (jumpPressed && player.onGround) {
    player.vy = player.jumpForce;
    player.onGround = false;
  }

  player.vy += GRAVITY;
  player.x += player.vx;
  player.y += player.vy;

  if (player.x - player.radius < minX) player.x = minX + player.radius;
  if (player.x + player.radius > maxX) player.x = maxX - player.radius;

  if (player.y >= GROUND_Y) {
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
  }
}

function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

function handleBallPlayerCollision(player) {
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.hypot(dx, dy);
  const minDist = ball.radius + player.radius;

  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x = player.x + nx * (minDist + 1);
    ball.y = player.y + ny * (minDist + 1);

    const speed = Math.min(11, Math.max(6.5, Math.hypot(ball.vx, ball.vy) * 1.05));
    ball.vx = nx * speed + player.vx * 0.35;
    ball.vy = ny * speed - 2.2;
  }
}

async function sendMatchResult(winnerName) {
  if (resultSent) return;
  resultSent = true;
  pythonStatsEl.textContent = "Sending match result to Python engine...";

  try {
    const endpoint = `${liveServerUrl || ""}/api/match-result`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p1Score: player1.score,
        p2Score: player2.score,
        winner: winnerName
      })
    });
    const data = await response.json();
    if (data.success) {
      pythonStatsEl.textContent = `Python Engine: ${data.message}`;
    } else {
      pythonStatsEl.textContent = "Python Engine error while saving stats.";
    }
  } catch (err) {
    pythonStatsEl.textContent = "Could not reach Node.js server.";
  }
}

function awardPoint(toPlayer2) {
  if (toPlayer2) {
    player2.score += 1;
    p2ScoreEl.textContent = String(player2.score);
  } else {
    player1.score += 1;
    p1ScoreEl.textContent = String(player1.score);
  }

  if (player1.score >= WIN_SCORE || player2.score >= WIN_SCORE) {
    matchOver = true;
    const winnerName = player1.score >= WIN_SCORE ? "Player 1 (Red)" : "Player 2 (Blue)";
    statusTextEl.textContent = `${winnerName} Wins!`;
    sendMatchResult(winnerName);
    return;
  }

  resetBall(!toPlayer2);
}

function update() {
  if (isOnlineMode) return;
  if (matchOver) return;

  const c = getLocalControls();
  updatePlayer(player1, c.p1Left, c.p1Right, c.p1Jump, 0, net.x);
  updatePlayer(player2, c.p2Left, c.p2Right, c.p2Jump, net.x + net.width, WIDTH);

  ball.vy += GRAVITY * 0.72;
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
  }
  if (ball.x + ball.radius > WIDTH) {
    ball.x = WIDTH - ball.radius;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
  }

  if (circleRectCollision(ball.x, ball.y, ball.radius, net.x, net.y, net.width, net.height)) {
    if (ball.x < net.x + net.width / 2) {
      ball.x = net.x - ball.radius - 1;
      ball.vx = -Math.abs(ball.vx);
    } else {
      ball.x = net.x + net.width + ball.radius + 1;
      ball.vx = Math.abs(ball.vx);
    }
  }

  handleBallPlayerCollision(player1);
  handleBallPlayerCollision(player2);

  if (ball.y + ball.radius >= GROUND_Y) {
    const landedOnRight = ball.x >= WIDTH / 2;
    awardPoint(landedOnRight);
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(0, 0, WIDTH, GROUND_Y);

  ctx.fillStyle = "#d97706";
  ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(net.x, net.y, net.width, net.height);

  ctx.fillStyle = player1.color;
  ctx.beginPath();
  ctx.arc(player1.x, player1.y, player1.radius, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = player2.color;
  ctx.beginPath();
  ctx.arc(player2.x, player2.y, player2.radius, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = ball.color;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

initOnlineMultiplayer(liveServerUrl, roomParam);
gameLoop();