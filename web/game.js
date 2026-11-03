(function () {
  'use strict';

  var COLS = 10;
  var ROWS = 20;
  var DROP_INTERVAL = 800; // ms

  var COLORS = {
    I: '#66bcd6',
    O: '#dfba62',
    T: '#9178d3',
    S: '#b5ea80',
    Z: '#e39c9c',
    J: '#749ce2',
    L: '#e0a06a'
  };

  // 每种方块用矩阵表示，旋转采用矩阵转置法
  var SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]]
  };
  var TYPES = ['I','O','T','S','Z','J','L'];

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');

  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlayTitle');
  var overlayText = document.getElementById('overlayText');
  var overlayBtn = document.getElementById('overlayBtn');
  var startBtn = document.getElementById('startBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var restartBtn = document.getElementById('restartBtn');

  var cell = canvas.width / COLS;

  var board, current, score, best, running, paused, dropTimer, lastTime, rafId;

  best = parseInt(localStorage.getItem('tetris_best') || '0', 10);
  bestEl.textContent = best;

  function emptyBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) {
      b.push(new Array(COLS).fill(0));
    }
    return b;
  }

  function randomPiece() {
    var type = TYPES[(Math.random() * TYPES.length) | 0];
    var matrix = SHAPES[type].map(function (row) { return row.slice(); });
    return {
      type: type,
      matrix: matrix,
      row: 0,
      col: ((COLS - matrix[0].length) / 2) | 0
    };
  }

  function collide(matrix, row, col) {
    for (var r = 0; r < matrix.length; r++) {
      for (var c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        var nr = row + r;
        var nc = col + c;
        if (nc < 0 || nc >= COLS || nr >= ROWS) return true;
        if (nr >= 0 && board[nr][nc]) return true;
      }
    }
    return false;
  }

  function merge() {
    var m = current.matrix;
    for (var r = 0; r < m.length; r++) {
      for (var c = 0; c < m[r].length; c++) {
        if (m[r][c]) {
          var nr = current.row + r;
          var nc = current.col + c;
          if (nr >= 0) board[nr][nc] = current.type;
        }
      }
    }
  }

  function clearLines() {
    var cleared = 0;
    for (var r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(function (v) { return v !== 0; })) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      var points = [0, 100, 300, 500, 800][cleared];
      score += points;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('tetris_best', String(best));
      }
    }
  }

  function rotate() {
    var m = current.matrix;
    var n = m.length;
    var rotated = [];
    for (var r = 0; r < n; r++) rotated.push(new Array(n).fill(0));
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        rotated[j][n - 1 - i] = m[i][j];
      }
    }
    var old = current.matrix;
    current.matrix = rotated;
    if (collide(current.matrix, current.row, current.col)) {
      // 简单踢墙：尝试左右偏移
      if (!collide(current.matrix, current.row, current.col - 1)) current.col -= 1;
      else if (!collide(current.matrix, current.row, current.col + 1)) current.col += 1;
      else current.matrix = old;
    }
  }

  function move(dx) {
    if (!collide(current.matrix, current.row, current.col + dx)) {
      current.col += dx;
    }
  }

  function softDrop() {
    if (!collide(current.matrix, current.row + 1, current.col)) {
      current.row += 1;
    } else {
      lockPiece();
    }
    dropTimer = 0;
  }

  function hardDrop() {
    while (!collide(current.matrix, current.row + 1, current.col)) {
      current.row += 1;
    }
    lockPiece();
    dropTimer = 0;
  }

  function lockPiece() {
    merge();
    clearLines();
    spawn();
  }

  function spawn() {
    current = randomPiece();
    if (collide(current.matrix, current.row, current.col)) {
      gameOver();
    }
  }

  function drawCell(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * cell, y * cell, cell, cell);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, 3);
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (var c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cell, 0);
      ctx.lineTo(c * cell, ROWS * cell);
      ctx.stroke();
    }
    for (var r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cell);
      ctx.lineTo(COLS * cell, r * cell);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111528';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c]) drawCell(c, r, COLORS[board[r][c]]);
      }
    }

    if (current) {
      var m = current.matrix;
      for (var i = 0; i < m.length; i++) {
        for (var j = 0; j < m[i].length; j++) {
          if (m[i][j]) {
            var nr = current.row + i;
            var nc = current.col + j;
            if (nr >= 0) drawCell(nc, nr, COLORS[current.type]);
          }
        }
      }
    }
  }

  function loop(time) {
    if (!running || paused) return;
    var delta = time - lastTime;
    lastTime = time;
    dropTimer += delta;
    if (dropTimer > DROP_INTERVAL) {
      softDrop();
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    board = emptyBoard();
    score = 0;
    scoreEl.textContent = '0';
    dropTimer = 0;
    lastTime = performance.now();
    running = true;
    paused = false;
    spawn();
    draw();
    hideOverlay();
    pauseBtn.textContent = '暂停';
    rafId = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      pauseBtn.textContent = '继续';
      showOverlay('已暂停', '点击继续游戏', '继续');
    } else {
      pauseBtn.textContent = '暂停';
      hideOverlay();
      lastTime = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }

  function gameOver() {
    running = false;
    cancelAnimationFrame(rafId);
    draw();
    showOverlay('游戏结束', '最终得分 ' + score + '<br/>最高分 ' + best, '重新开始');
  }

  function showOverlay(title, text, btn) {
    overlayTitle.innerHTML = title;
    overlayText.innerHTML = text;
    overlayBtn.textContent = btn;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // 键盘控制
  document.addEventListener('keydown', function (e) {
    if (!running || paused) {
      if (e.code === 'Space' && !running) { startGame(); e.preventDefault(); }
      return;
    }
    switch (e.code) {
      case 'ArrowLeft': move(-1); e.preventDefault(); break;
      case 'ArrowRight': move(1); e.preventDefault(); break;
      case 'ArrowDown': softDrop(); e.preventDefault(); break;
      case 'ArrowUp': rotate(); e.preventDefault(); break;
      case 'Space': hardDrop(); e.preventDefault(); break;
      case 'KeyP': togglePause(); break;
    }
    draw();
  });

  // 触屏按钮
  Array.prototype.forEach.call(document.querySelectorAll('.tbtn'), function (btn) {
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      handleAction(btn.getAttribute('data-act'));
    }, { passive: false });
    btn.addEventListener('click', function () {
      handleAction(btn.getAttribute('data-act'));
    });
  });

  function handleAction(act) {
    if (!running || paused) return;
    if (act === 'left') move(-1);
    else if (act === 'right') move(1);
    else if (act === 'down') softDrop();
    else if (act === 'rotate') rotate();
    else if (act === 'drop') hardDrop();
    draw();
  }

  startBtn.addEventListener('click', function () {
    if (!running) startGame();
    else togglePause();
  });
  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', startGame);
  overlayBtn.addEventListener('click', function () {
    if (running && paused) togglePause();
    else startGame();
  });

  // 初始画面
  board = emptyBoard();
  current = null;
  score = 0;
  running = false;
  paused = false;
  draw();
})();
