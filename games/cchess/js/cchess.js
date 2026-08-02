'use strict';

/* ============================================================
   Xiangqi (Chinese Chess) — local two-player, single device
   Board coordinates: row 0..9 (0 = black's back rank, 9 = red's
   back rank), col 0..8. River lies between row 4 and row 5.
   ============================================================ */

const COLS = 9;
const ROWS = 10;
let CELL = 66;
let MARGIN = Math.round(CELL * 0.759);
let PIECE_R = CELL * 0.44;

const RED = 'red';
const BLACK = 'black';

const GLYPH = {
  red:   { general: '帥', advisor: '仕', elephant: '相', horse: '傌', chariot: '俥', cannon: '炮', soldier: '兵' },
  black: { general: '將', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '砲', soldier: '卒' }
};

const NAME = {
  general: 'General', advisor: 'Advisor', elephant: 'Elephant',
  horse: 'Horse', chariot: 'Chariot', cannon: 'Cannon', soldier: 'Soldier'
};

/* ---------------- Board setup ---------------- */

function createInitialBoard() {
  const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const backRow = ['chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot'];

  backRow.forEach((type, c) => { b[0][c] = { type, color: BLACK, hidden: false }; });
  b[2][1] = { type: 'cannon', color: BLACK, hidden: false };
  b[2][7] = { type: 'cannon', color: BLACK, hidden: false };
  [0, 2, 4, 6, 8].forEach(c => { b[3][c] = { type: 'soldier', color: BLACK, hidden: false }; });

  backRow.forEach((type, c) => { b[9][c] = { type, color: RED, hidden: false }; });
  b[7][1] = { type: 'cannon', color: RED, hidden: false };
  b[7][7] = { type: 'cannon', color: RED, hidden: false };
  [0, 2, 4, 6, 8].forEach(c => { b[6][c] = { type: 'soldier', color: RED, hidden: false }; });

  return b;
}

// Back row layout, indexed by column; the general's column (4) is handled separately.
const BACK_ROW_TYPES = ['chariot', 'horse', 'elephant', 'advisor', null, 'advisor', 'elephant', 'horse', 'chariot'];

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Blind Chess (暗棋) setup: only the Generals start revealed. Every other
 * piece sits on the same 15 traditional starting squares per side, but
 * which piece type occupies which square is randomly shuffled. Each
 * hidden piece remembers the "slot type" (the type that traditionally
 * starts on that square) — until it makes its first move it can only
 * move the way that slot type would, per generatePseudoMoves().
 */
function createBlindBoard() {
  const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  for (const color of [RED, BLACK]) {
    const backRow = color === RED ? 9 : 0;
    const cannonRow = color === RED ? 7 : 2;
    const soldierRow = color === RED ? 6 : 3;

    b[backRow][4] = { type: 'general', color, hidden: false };

    const slots = [];
    BACK_ROW_TYPES.forEach((type, c) => {
      if (type) slots.push({ r: backRow, c, type });
    });
    [1, 7].forEach(c => slots.push({ r: cannonRow, c, type: 'cannon' }));
    [0, 2, 4, 6, 8].forEach(c => slots.push({ r: soldierRow, c, type: 'soldier' }));

    const shuffledTypes = shuffleArray(slots.map(s => s.type));
    slots.forEach((slot, i) => {
      b[slot.r][slot.c] = { type: shuffledTypes[i], color, hidden: true, slotType: slot.type };
    });
  }

  return b;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function inPalace(r, c, color) {
  if (c < 3 || c > 5) return false;
  return color === RED ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
}

function onOwnSide(r, color) {
  return color === RED ? r >= 5 : r <= 4;
}

/* ---------------- Pseudo-legal move generation ---------------- */

function generatePseudoMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  // A hidden piece moves according to the slot it started on, not its
  // true identity, until its first move reveals it.
  const type = piece.hidden ? piece.slotType : piece.type;
  const color = piece.color;
  const enemy = color === RED ? BLACK : RED;
  const moves = [];

  const canLand = (nr, nc) => {
    if (!inBounds(nr, nc)) return false;
    const p = board[nr][nc];
    return !p || p.color === enemy;
  };

  switch (type) {
    case 'general': {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (inPalace(nr, nc, color) && canLand(nr, nc)) moves.push([nr, nc]);
      }
      break;
    }
    case 'advisor': {
      // Whether the Advisor may ever leave the palace is decided once, at
      // the moment it's revealed (see makeMove): revealed still inside
      // its palace (always true in Classic mode, since it's never
      // "hidden" to begin with) means the traditional confinement applies
      // permanently. Revealed already outside (only possible in Blind
      // Chess, via a different slot's pre-reveal move) means it's
      // permanently free — one diagonal step anywhere — including moving
      // back into the palace without losing that freedom.
      const confined = !piece.leftPalace;
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (confined && !inPalace(nr, nc, color)) continue;
        if (canLand(nr, nc)) moves.push([nr, nc]);
      }
      break;
    }
    case 'elephant': {
      // Whether the Elephant may ever cross the river is decided once, at
      // the moment it's revealed (see makeMove): revealed still on its
      // own side (always true in Classic mode, since it's never "hidden"
      // to begin with) means the traditional river restriction applies
      // permanently. Revealed already across (only possible in Blind
      // Chess, via a different slot's pre-reveal move — e.g. a cannon
      // slot's clear-column slide) means it's permanently free to hop
      // either way, including back to its own side, without losing that
      // freedom.
      const confined = !piece.crossedRiver;
      for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
        const nr = r + dr, nc = c + dc;
        const er = r + dr / 2, ec = c + dc / 2;
        if (!inBounds(nr, nc)) continue;
        if (confined && !onOwnSide(nr, color)) continue;
        if (board[er][ec]) continue; // blocked at elephant eye
        if (canLand(nr, nc)) moves.push([nr, nc]);
      }
      break;
    }
    case 'horse': {
      const steps = [
        [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
        [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]
      ];
      for (const [dr, dc, legR, legC] of steps) {
        const nr = r + dr, nc = c + dc;
        const lr = r + legR, lc = c + legC;
        if (!inBounds(nr, nc)) continue;
        if (board[lr][lc]) continue; // hobbled leg
        if (canLand(nr, nc)) moves.push([nr, nc]);
      }
      break;
    }
    case 'chariot': {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          const p = board[nr][nc];
          if (!p) {
            moves.push([nr, nc]);
          } else {
            if (p.color === enemy) moves.push([nr, nc]);
            break;
          }
          nr += dr; nc += dc;
        }
      }
      break;
    }
    case 'cannon': {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let nr = r + dr, nc = c + dc;
        let screenFound = false;
        while (inBounds(nr, nc)) {
          const p = board[nr][nc];
          if (!screenFound) {
            if (!p) {
              moves.push([nr, nc]);
            } else {
              screenFound = true;
            }
          } else {
            if (p) {
              if (p.color === enemy) moves.push([nr, nc]);
              break;
            }
          }
          nr += dr; nc += dc;
        }
      }
      break;
    }
    case 'soldier': {
      const fwd = color === RED ? -1 : 1;
      if (canLand(r + fwd, c)) moves.push([r + fwd, c]);
      const crossed = color === RED ? r <= 4 : r >= 5;
      if (crossed) {
        if (canLand(r, c - 1)) moves.push([r, c - 1]);
        if (canLand(r, c + 1)) moves.push([r, c + 1]);
      }
      break;
    }
  }

  return moves;
}

function findGeneral(board, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.type === 'general' && p.color === color) return [r, c];
    }
  }
  return null;
}

function isSquareAttacked(board, r, c, byColor) {
  for (let sr = 0; sr < ROWS; sr++) {
    for (let sc = 0; sc < COLS; sc++) {
      const p = board[sr][sc];
      if (p && p.color === byColor) {
        const moves = generatePseudoMoves(board, sr, sc);
        for (const [mr, mc] of moves) {
          if (mr === r && mc === c) return true;
        }
      }
    }
  }
  return false;
}

function isInCheck(board, color) {
  const gen = findGeneral(board, color);
  if (!gen) return false;
  const [gr, gc] = gen;
  const enemy = color === RED ? BLACK : RED;
  if (isSquareAttacked(board, gr, gc, enemy)) return true;

  // Flying general: kings may never face each other on an open file.
  const oppGen = findGeneral(board, enemy);
  if (oppGen && oppGen[1] === gc) {
    let blocked = false;
    const lo = Math.min(gr, oppGen[0]);
    const hi = Math.max(gr, oppGen[0]);
    for (let rr = lo + 1; rr < hi; rr++) {
      if (board[rr][gc]) { blocked = true; break; }
    }
    if (!blocked) return true;
  }
  return false;
}

function getLegalMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const pseudo = generatePseudoMoves(board, r, c);
  const legal = [];
  for (const [nr, nc] of pseudo) {
    const b2 = cloneBoard(board);
    b2[nr][nc] = b2[r][c];
    b2[r][c] = null;
    if (!isInCheck(b2, piece.color)) legal.push([nr, nc]);
  }
  return legal;
}

function getAllLegalMoves(board, color) {
  const all = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        for (const mv of getLegalMoves(board, r, c)) {
          all.push({ from: [r, c], to: mv });
        }
      }
    }
  }
  return all;
}

/* ---------------- Game state ---------------- */

const state = {
  mode: 'classic', // 'classic' | 'blind'
  board: createInitialBoard(),
  turn: RED,
  capturedRed: [],   // red pieces that were captured (i.e. black's trophies)
  capturedBlack: [],
  gameOver: false,
  statusMessage: '',
  lastMove: null,
  selected: null,
  legalTargets: [],
  history: [],   // stack of previous full states, for undo
  moveLog: [],
  showMoves: true
};

function snapshotState() {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    capturedRed: [...state.capturedRed],
    capturedBlack: [...state.capturedBlack],
    gameOver: state.gameOver,
    statusMessage: state.statusMessage,
    lastMove: state.lastMove ? { from: [...state.lastMove.from], to: [...state.lastMove.to] } : null
  };
}

function restoreState(snap) {
  state.board = snap.board;
  state.turn = snap.turn;
  state.capturedRed = snap.capturedRed;
  state.capturedBlack = snap.capturedBlack;
  state.gameOver = snap.gameOver;
  state.statusMessage = snap.statusMessage;
  state.lastMove = snap.lastMove;
  state.selected = null;
  state.legalTargets = [];
}

function colToFile(c, color) {
  // Traditional notation counts files from each side's own right.
  return color === RED ? (9 - c) : (c + 1);
}

function describeMove(piece, from, to, captured) {
  const label = `${piece.color === RED ? 'Red' : 'Black'} ${NAME[piece.type]}`;
  const fromFile = colToFile(from[1], piece.color);
  const toFile = colToFile(to[1], piece.color);
  let desc = `${label} ${fromFile}.${from[0]}${captured ? 'x' : '-'}${toFile}.${to[0]}`;
  if (captured) {
    // In pure Blind mode a piece that was still face-down at the moment
    // of capture keeps its identity secret forever. Semi-Blind never hid
    // it in the first place (both players could already see the hint).
    const redact = captured.hidden && state.mode === 'blind';
    desc += redact ? ' (captures a hidden piece)' : ` (captures ${NAME[captured.type]})`;
  }
  return desc;
}

function makeMove(from, to) {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = state.board[fr][fc];
  const captured = state.board[tr][tc];

  state.history.push(snapshotState());

  const desc = describeMove(piece, from, to, captured);

  state.board[tr][tc] = piece;
  state.board[fr][fc] = null;
  state.lastMove = { from, to };

  if (piece.hidden) {
    piece.hidden = false; // first move reveals a blind piece's true identity
    // Whether a revealed Elephant/Advisor gets to permanently ignore the
    // river/palace boundary is decided right here, once: if the very move
    // that revealed it already carried it past that boundary (only
    // possible via a different slot's movement rules), it's free for
    // good, crossing back and forth freely from now on. If it's revealed
    // still at home, the traditional restriction applies permanently.
    if (!onOwnSide(tr, piece.color)) piece.crossedRiver = true;
    if (!inPalace(tr, tc, piece.color)) piece.leftPalace = true;
  }

  if (captured) {
    if (captured.color === RED) state.capturedRed.push(captured);
    else state.capturedBlack.push(captured);
  }

  const mover = state.turn;
  const opponent = mover === RED ? BLACK : RED;
  state.turn = opponent;

  const oppInCheck = isInCheck(state.board, opponent);
  const oppMoves = getAllLegalMoves(state.board, opponent);

  let statusSuffix = '';
  if (oppMoves.length === 0) {
    state.gameOver = true;
    if (oppInCheck) {
      state.statusMessage = `Checkmate — ${mover === RED ? 'Red' : 'Black'} wins!`;
      statusSuffix = ' #';
    } else {
      state.statusMessage = `Stalemate — ${mover === RED ? 'Red' : 'Black'} wins!`;
    }
  } else if (oppInCheck) {
    state.statusMessage = `${opponent === RED ? 'Red' : 'Black'} is in check!`;
    statusSuffix = '+';
  } else {
    state.statusMessage = '';
  }

  state.moveLog.push({ text: desc + statusSuffix, color: mover });
  state.selected = null;
  state.legalTargets = [];

  render();
  maybeBroadcast();
}

function undo() {
  if (state.history.length === 0) return;
  const snap = state.history.pop();
  restoreState(snap);
  state.moveLog.pop();
  render();
  maybeBroadcast();
}

function restart() {
  state.board = BLIND_MODES.includes(state.mode) ? createBlindBoard() : createInitialBoard();
  state.turn = RED;
  state.capturedRed = [];
  state.capturedBlack = [];
  state.gameOver = false;
  state.statusMessage = '';
  state.lastMove = null;
  state.selected = null;
  state.legalTargets = [];
  state.history = [];
  state.moveLog = [];
  render();
  maybeBroadcast();
}

/* ---------------- Rendering ---------------- */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

function applyBoardSize(cell) {
  CELL = cell;
  MARGIN = Math.round(cell * 0.759);
  PIECE_R = CELL * 0.44;
  canvas.width = MARGIN * 2 + (COLS - 1) * CELL;
  canvas.height = MARGIN * 2 + (ROWS - 1) * CELL;
}

applyBoardSize(CELL);

function pt(r, c) {
  return { x: MARGIN + c * CELL, y: MARGIN + r * CELL };
}

function nearestPoint(px, py) {
  const c = Math.round((px - MARGIN) / CELL);
  const r = Math.round((py - MARGIN) / CELL);
  if (!inBounds(r, c)) return null;
  const { x, y } = pt(r, c);
  const dist = Math.hypot(px - x, py - y);
  if (dist > CELL * 0.42) return null;
  return [r, c];
}

const MARK_POINTS = new Set();
[[2, 1], [2, 7], [7, 1], [7, 7]].forEach(([r, c]) => MARK_POINTS.add(`${r},${c}`));
[[3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]]
  .forEach(([r, c]) => MARK_POINTS.add(`${r},${c}`));

function drawCornerMark(x, y, dx, dy) {
  const len = 7, gap = 4;
  ctx.beginPath();
  ctx.moveTo(x + dx * gap, y + dy * gap);
  ctx.lineTo(x + dx * gap, y + dy * (gap + len));
  ctx.moveTo(x + dx * gap, y + dy * gap);
  ctx.lineTo(x + dx * (gap + len), y + dy * gap);
  ctx.stroke();
}

function drawPositionMark(r, c) {
  const { x, y } = pt(r, c);
  ctx.strokeStyle = 'rgba(60,40,20,0.75)';
  ctx.lineWidth = 1.4;
  const hasLeft = c > 0;
  const hasRight = c < COLS - 1;
  if (hasLeft) {
    drawCornerMark(x, y, -1, -1);
    drawCornerMark(x, y, -1, 1);
  }
  if (hasRight) {
    drawCornerMark(x, y, 1, -1);
    drawCornerMark(x, y, 1, 1);
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // background
  ctx.fillStyle = '#e7bd7a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#6b4429';
  ctx.lineWidth = 1.6;

  // horizontal lines (full width, every row)
  for (let r = 0; r < ROWS; r++) {
    const { x: x0, y } = pt(r, 0);
    const { x: x1 } = pt(r, COLS - 1);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  // vertical lines: edges full height; inner columns broken at the river
  for (let c = 0; c < COLS; c++) {
    const { x, y: y0 } = pt(0, c);
    if (c === 0 || c === COLS - 1) {
      const { y: y1 } = pt(ROWS - 1, c);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    } else {
      const { y: yRiverTop } = pt(4, c);
      const { y: yRiverBot } = pt(5, c);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, yRiverTop);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, yRiverBot);
      const { y: yEnd } = pt(ROWS - 1, c);
      ctx.lineTo(x, yEnd);
      ctx.stroke();
    }
  }

  // palace diagonals
  ctx.beginPath();
  let a = pt(0, 3), b = pt(2, 5);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  a = pt(0, 5); b = pt(2, 3);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  a = pt(7, 3); b = pt(9, 5);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  a = pt(7, 5); b = pt(9, 3);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // position marks
  MARK_POINTS.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    drawPositionMark(r, c);
  });

  // river text
  ctx.fillStyle = 'rgba(60,40,20,0.55)';
  ctx.font = `${Math.round(CELL * 0.42)}px "Kaiti SC", "STKaiti", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riverY = (pt(4, 0).y + pt(5, 0).y) / 2;
  ctx.fillText('楚 河', pt(4, 2).x, riverY);
  ctx.fillText('漢 界', pt(4, 6).x, riverY);

  // outer border accent
  ctx.strokeStyle = '#4a2e1c';
  ctx.lineWidth = 3;
  ctx.strokeRect(pt(0, 0).x - 2, pt(0, 0).y - 2,
    pt(ROWS - 1, COLS - 1).x - pt(0, 0).x + 4,
    pt(ROWS - 1, COLS - 1).y - pt(0, 0).y + 4);
}

function drawHighlights() {
  if (state.lastMove) {
    ctx.fillStyle = 'rgba(255, 210, 90, 0.35)';
    for (const [r, c] of [state.lastMove.from, state.lastMove.to]) {
      const { x, y } = pt(r, c);
      ctx.beginPath();
      ctx.arc(x, y, PIECE_R * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (state.selected) {
    const { x, y } = pt(state.selected[0], state.selected[1]);
    ctx.strokeStyle = '#2f6f4f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, PIECE_R + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.showMoves) {
    for (const [r, c] of state.legalTargets) {
      const { x, y } = pt(r, c);
      const occupant = state.board[r][c];
      if (occupant) {
        ctx.strokeStyle = 'rgba(47,111,79,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, PIECE_R + 5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(47,111,79,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // highlight a general in check
  for (const color of [RED, BLACK]) {
    if (isInCheck(state.board, color)) {
      const gen = findGeneral(state.board, color);
      if (gen) {
        const { x, y } = pt(gen[0], gen[1]);
        ctx.strokeStyle = 'rgba(200,30,30,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, PIECE_R + 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function drawPieces() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const { x, y } = pt(r, c);
      const mainColor = p.color === RED ? '#b0272d' : '#1a1a1a';

      if (p.hidden) {
        // Face-down piece: side is visible, true identity is not — unless
        // Semi-Blind mode is active, which shows a translucent hint of
        // every hidden piece to both players (it's one shared screen, so
        // there's no real secrecy to protect between the two of them).
        const peek = state.mode === 'semiblind';

        ctx.beginPath();
        ctx.arc(x, y, PIECE_R, 0, Math.PI * 2);
        ctx.fillStyle = p.color === RED ? '#dba9a1' : '#a9a9a4';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = mainColor;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, PIECE_R - 4, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = mainColor;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (peek) {
          ctx.fillStyle = mainColor;
          ctx.font = `bold ${Math.round(CELL * 0.4)}px "Kaiti SC", "STKaiti", "Microsoft YaHei", serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.4;
          ctx.fillText(GLYPH[p.color][p.type], x, y + 1);
          ctx.globalAlpha = 1;
        } else {
          // Decorative woven-border emblem instead of a plain dot.
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.arc(x, y, PIECE_R * 0.6, 0, Math.PI * 2);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = mainColor;
          ctx.globalAlpha = 0.6;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;

          const s = PIECE_R * 0.22;
          ctx.beginPath();
          ctx.moveTo(x, y - s);
          ctx.lineTo(x + s, y);
          ctx.lineTo(x, y + s);
          ctx.lineTo(x - s, y);
          ctx.closePath();
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = mainColor;
          ctx.globalAlpha = 0.65;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        continue;
      }

      ctx.beginPath();
      ctx.arc(x, y, PIECE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#f5ecd7';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = mainColor;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, PIECE_R - 4, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = p.color === RED ? 'rgba(176,39,45,0.5)' : 'rgba(26,26,26,0.5)';
      ctx.stroke();

      ctx.fillStyle = mainColor;
      ctx.font = `bold ${Math.round(CELL * 0.4)}px "Kaiti SC", "STKaiti", "Microsoft YaHei", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GLYPH[p.color][p.type], x, y + 1);
    }
  }
}

function render() {
  drawBoard();
  drawHighlights();
  drawPieces();
  renderSidePanel();
}

/* ---------------- Side panel ---------------- */

const turnBanner = document.getElementById('turnBanner');
const turnDot = document.getElementById('turnDot');
const turnText = document.getElementById('turnText');
const statusLine = document.getElementById('statusLine');
const undoBtn = document.getElementById('undoBtn');
const capturedRedEl = document.getElementById('capturedRed');
const capturedBlackEl = document.getElementById('capturedBlack');
const moveLogEl = document.getElementById('moveLog');

function renderSidePanel() {
  if (state.gameOver) {
    turnText.textContent = state.statusMessage;
  } else if (isOnline()) {
    const whose = state.turn === myOnlineColor ? 'Your turn' : "Opponent's turn";
    turnText.textContent = `${whose} (${state.turn === RED ? 'Red' : 'Black'})`;
  } else {
    turnText.textContent = `${state.turn === RED ? 'Red' : 'Black'} to move`;
  }
  turnDot.classList.toggle('black', state.turn === BLACK);
  statusLine.textContent = state.gameOver ? '' : state.statusMessage;

  // moveLog and history always grow/shrink together, and moveLog is the
  // field synced to the joiner over the network, so it works for both.
  undoBtn.disabled = state.moveLog.length === 0;
  shuffleBtn.hidden = !(BLIND_MODES.includes(state.mode) && !hasGameProgress());

  // Only pure Blind mode keeps a captured piece's identity secret; Semi-Blind
  // never hid it from the players in the first place.
  const redactCaptured = p => p.hidden && state.mode === 'blind';

  capturedRedEl.innerHTML = '';
  state.capturedRed.forEach(p => {
    const chip = document.createElement('span');
    const redact = redactCaptured(p);
    chip.className = 'chip red' + (redact ? ' chip-hidden' : '');
    chip.textContent = redact ? '?' : GLYPH.red[p.type];
    capturedRedEl.appendChild(chip);
  });

  capturedBlackEl.innerHTML = '';
  state.capturedBlack.forEach(p => {
    const chip = document.createElement('span');
    const redact = redactCaptured(p);
    chip.className = 'chip black' + (redact ? ' chip-hidden' : '');
    chip.textContent = redact ? '?' : GLYPH.black[p.type];
    capturedBlackEl.appendChild(chip);
  });

  moveLogEl.innerHTML = '';
  state.moveLog.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = entry.text;
    li.className = entry.color === RED ? 'red-move' : 'black-move';
    moveLogEl.appendChild(li);
  });
  moveLogEl.scrollTop = moveLogEl.scrollHeight;
}

/* ---------------- Interaction ---------------- */

canvas.addEventListener('click', e => {
  if (state.gameOver) return;
  if (isOnline() && state.turn !== myOnlineColor) return; // not your turn on the other device
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  const point = nearestPoint(px, py);
  if (!point) return;
  const [r, c] = point;
  const piece = state.board[r][c];

  if (state.selected) {
    const [sr, sc] = state.selected;
    if (sr === r && sc === c) {
      state.selected = null;
      state.legalTargets = [];
      render();
      return;
    }
    const isTarget = state.legalTargets.some(([tr, tc]) => tr === r && tc === c);
    if (isTarget) {
      if (isOnline() && onlineRole === 'joiner') {
        conn.send({ type: 'requestMove', from: state.selected, to: [r, c] });
        state.selected = null;
        state.legalTargets = [];
        render();
      } else {
        makeMove(state.selected, [r, c]);
      }
      return;
    }
    if (piece && piece.color === state.turn) {
      state.selected = [r, c];
      state.legalTargets = getLegalMoves(state.board, r, c);
      render();
      return;
    }
    state.selected = null;
    state.legalTargets = [];
    render();
    return;
  }

  if (piece && piece.color === state.turn) {
    state.selected = [r, c];
    state.legalTargets = getLegalMoves(state.board, r, c);
    render();
  }
});

undoBtn.addEventListener('click', () => {
  if (isOnline() && onlineRole === 'joiner') {
    conn.send({ type: 'requestUndo' });
    return;
  }
  undo();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  if (state.history.length > 0 || state.moveLog.length > 0) {
    const confirmed = window.confirm('Restart the game? Current progress will be lost.');
    if (!confirmed) return;
  }
  if (isOnline() && onlineRole === 'joiner') {
    conn.send({ type: 'requestRestart' });
    return;
  }
  restart();
});

/* ---------------- Game mode ---------------- */

const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
const modeDesc = document.getElementById('modeDesc');
const modeBadge = document.getElementById('modeBadge');
const shuffleBtn = document.getElementById('shuffleBtn');

const BLIND_MODES = ['blind', 'semiblind'];

const MODE_DESC = {
  classic: 'Standard Xiangqi — all pieces are visible from the start.',
  blind: 'All pieces except the Generals start face-down in randomized positions on their own side. A hidden piece’s first move follows the rules of the slot it started on; moving it reveals it, and from then on it moves by its true identity.',
  semiblind: 'Same setup and rules as Blind Chess, but every hidden piece shows a translucent hint of its true identity to both players — on a shared screen there’s no real secret to keep anyway. Each piece still only moves like the slot it started on until its first move fully reveals it.'
};

const MODE_BADGE_TEXT = {
  blind: '暗棋 Blind',
  semiblind: '半盲棋 Semi-Blind'
};

function applyModeUI(mode) {
  modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  modeDesc.textContent = MODE_DESC[mode];
  modeBadge.hidden = mode === 'classic';
  if (mode !== 'classic') modeBadge.textContent = MODE_BADGE_TEXT[mode];
}

function hasGameProgress() {
  return state.history.length > 0 || state.moveLog.length > 0;
}

function performModeSwitch(newMode) {
  state.mode = newMode;
  applyModeUI(newMode);
  restart(); // restart() broadcasts automatically when we're the host
  saveSettings();
}

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const newMode = btn.dataset.mode;
    if (newMode === state.mode) return;
    if (hasGameProgress()) {
      const confirmed = window.confirm('Switch game mode? This will restart the game and current progress will be lost.');
      if (!confirmed) return;
    }
    if (isOnline() && onlineRole === 'joiner') {
      conn.send({ type: 'requestSetMode', mode: newMode });
      return;
    }
    performModeSwitch(newMode);
  });
});

function performShuffle() {
  state.board = createBlindBoard();
  canvas.classList.remove('shuffle-pulse');
  void canvas.offsetWidth; // restart the CSS animation on repeated clicks
  canvas.classList.add('shuffle-pulse');
  render();
  maybeBroadcast();
}

shuffleBtn.addEventListener('click', () => {
  if (isOnline() && onlineRole === 'joiner') {
    conn.send({ type: 'requestShuffle' });
    return;
  }
  performShuffle();
});

/* ---------------- Settings: board size, move highlighting, sidebar ---------------- */

const sizeSlider = document.getElementById('sizeSlider');
const sizeValue = document.getElementById('sizeValue');
const showMovesToggle = document.getElementById('showMovesToggle');
const menuToggle = document.getElementById('menuToggle');
const sidePanel = document.getElementById('sidePanel');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

const SETTINGS_KEY = 'cchess-settings';
let sidebarOpen = false;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      cell: CELL,
      showMoves: state.showMoves,
      sidebarOpen,
      mode: state.mode
    }));
  } catch (e) {
    // ignore storage failures (e.g. private browsing)
  }
}

function setSidebarOpen(open) {
  sidebarOpen = open;
  sidePanel.classList.toggle('open', open);
  sidebarBackdrop.classList.toggle('show', open);
  menuToggle.setAttribute('aria-expanded', String(open));
}

const savedSettings = loadSettings();
if (savedSettings.cell) {
  applyBoardSize(savedSettings.cell);
  sizeSlider.value = savedSettings.cell;
}
if (typeof savedSettings.showMoves === 'boolean') {
  state.showMoves = savedSettings.showMoves;
  showMovesToggle.checked = savedSettings.showMoves;
}
if (['classic', 'blind', 'semiblind'].includes(savedSettings.mode)) {
  state.mode = savedSettings.mode;
  if (BLIND_MODES.includes(state.mode)) state.board = createBlindBoard();
}
applyModeUI(state.mode);
setSidebarOpen(typeof savedSettings.sidebarOpen === 'boolean' ? savedSettings.sidebarOpen : false);
sizeValue.textContent = `${CELL}px`;

sizeSlider.addEventListener('input', () => {
  applyBoardSize(Number(sizeSlider.value));
  sizeValue.textContent = `${CELL}px`;
  render();
  saveSettings();
});

showMovesToggle.addEventListener('change', () => {
  state.showMoves = showMovesToggle.checked;
  render();
  saveSettings();
});

menuToggle.addEventListener('click', () => {
  setSidebarOpen(!sidebarOpen);
  saveSettings();
});

sidebarBackdrop.addEventListener('click', () => {
  setSidebarOpen(false);
  saveSettings();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sidebarOpen) {
    setSidebarOpen(false);
    saveSettings();
  }
});

/* ---------------- Online multiplayer (2 devices, WebRTC via PeerJS) ----------------
   The host is the sole authority over game state. The joiner's clicks and
   button presses just send "request" messages; the host applies them with
   the exact same functions used for local play (makeMove/undo/restart/etc,
   which already validate legality), then broadcasts the resulting full
   state to the joiner. This keeps both sides trivially in sync — including
   for Blind/Semi-Blind's randomized setup, which only the host generates. */

const ROOM_PREFIX = 'cchess-';
let peer = null;
let conn = null;
let onlineRole = null; // null | 'host' | 'joiner'
let myOnlineColor = null; // RED | BLACK, set once connected

const onlineStatus = document.getElementById('onlineStatus');
const onlineSetup = document.getElementById('onlineSetup');
const onlineRoomInfo = document.getElementById('onlineRoomInfo');
const roomCodeText = document.getElementById('roomCodeText');
const hostBtn = document.getElementById('hostBtn');
const joinBtn = document.getElementById('joinBtn');
const joinCodeInput = document.getElementById('joinCodeInput');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

function isOnline() { return onlineRole !== null; }

function randomRoomCode(len) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easy to read aloud
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function setOnlineStatus(text) {
  onlineStatus.textContent = text;
}

function networkStateSnapshot() {
  return {
    board: state.board,
    turn: state.turn,
    capturedRed: state.capturedRed,
    capturedBlack: state.capturedBlack,
    gameOver: state.gameOver,
    statusMessage: state.statusMessage,
    lastMove: state.lastMove,
    mode: state.mode,
    moveLog: state.moveLog
  };
}

function maybeBroadcast() {
  if (onlineRole === 'host') broadcastState();
}

function broadcastState() {
  if (conn && conn.open) conn.send({ type: 'state', payload: networkStateSnapshot() });
}

function applyNetworkState(payload) {
  state.board = payload.board;
  state.turn = payload.turn;
  state.capturedRed = payload.capturedRed;
  state.capturedBlack = payload.capturedBlack;
  state.gameOver = payload.gameOver;
  state.statusMessage = payload.statusMessage;
  state.lastMove = payload.lastMove;
  state.mode = payload.mode;
  state.moveLog = payload.moveLog;
  state.selected = null;
  state.legalTargets = [];
  applyModeUI(state.mode);
  render();
}

function handleNetworkMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  if (onlineRole === 'joiner') {
    if (msg.type === 'state') applyNetworkState(msg.payload);
    return;
  }

  if (onlineRole === 'host') {
    if (msg.type === 'requestMove' && !state.gameOver && state.turn === BLACK) {
      const piece = state.board[msg.from[0]][msg.from[1]];
      if (piece && piece.color === BLACK) {
        const legal = getLegalMoves(state.board, msg.from[0], msg.from[1]);
        const ok = legal.some(([r, c]) => r === msg.to[0] && c === msg.to[1]);
        if (ok) makeMove(msg.from, msg.to);
      }
    } else if (msg.type === 'requestUndo') {
      undo();
    } else if (msg.type === 'requestRestart') {
      restart();
    } else if (msg.type === 'requestShuffle' && BLIND_MODES.includes(state.mode) && !hasGameProgress()) {
      performShuffle();
    } else if (msg.type === 'requestSetMode' && ['classic', 'blind', 'semiblind'].includes(msg.mode)) {
      performModeSwitch(msg.mode);
    }
  }
}

function wireConnection(c, role) {
  conn = c;
  onlineRole = role;
  myOnlineColor = role === 'host' ? RED : BLACK;

  conn.on('open', () => {
    setOnlineStatus(role === 'host'
      ? 'Connected — you are Red. Opponent is Black.'
      : 'Connected — you are Black. Host is Red.');
    onlineSetup.hidden = true;
    disconnectBtn.hidden = false;
    if (role === 'host') restart(); // fresh, synced game for the new opponent
    render();
  });

  conn.on('data', handleNetworkMessage);

  conn.on('close', () => {
    const wasOnline = isOnline();
    teardownOnline();
    if (wasOnline) setOnlineStatus('Opponent disconnected. Playing locally again.');
  });

  conn.on('error', () => {
    setOnlineStatus('Connection error — the link was lost.');
  });
}

function teardownOnline() {
  if (conn) { try { conn.close(); } catch (e) { /* already closed */ } }
  if (peer) { try { peer.destroy(); } catch (e) { /* already destroyed */ } }
  conn = null;
  peer = null;
  onlineRole = null;
  myOnlineColor = null;
  onlineSetup.hidden = false;
  onlineRoomInfo.hidden = true;
  disconnectBtn.hidden = true;
  hostBtn.disabled = false;
  joinBtn.disabled = false;
  joinCodeInput.value = '';
  render();
}

hostBtn.addEventListener('click', () => {
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  setOnlineStatus('Setting up room…');
  const code = ROOM_PREFIX + randomRoomCode(5);
  peer = new Peer(code);

  peer.on('open', id => {
    roomCodeText.textContent = id.replace(ROOM_PREFIX, '');
    onlineRoomInfo.hidden = false;
    setOnlineStatus('Waiting for opponent to join…');
  });

  peer.on('connection', c => wireConnection(c, 'host'));

  peer.on('error', err => {
    setOnlineStatus('Could not host: ' + (err && err.type ? err.type : 'connection failed'));
    hostBtn.disabled = false;
    joinBtn.disabled = false;
  });
});

joinBtn.addEventListener('click', () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) return;
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  setOnlineStatus('Connecting…');
  peer = new Peer();

  peer.on('open', () => {
    const c = peer.connect(ROOM_PREFIX + code, { reliable: true });
    wireConnection(c, 'joiner');
  });

  peer.on('error', err => {
    setOnlineStatus('Could not connect: ' + (err && err.type ? err.type : 'check the code and try again'));
    hostBtn.disabled = false;
    joinBtn.disabled = false;
  });
});

disconnectBtn.addEventListener('click', () => {
  teardownOnline();
  setOnlineStatus('Disconnected. Playing locally.');
});

copyCodeBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCodeText.textContent);
    const original = copyCodeBtn.textContent;
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => { copyCodeBtn.textContent = original; }, 1200);
  } catch (e) {
    // Clipboard API unavailable (e.g. insecure context) — ignore silently.
  }
});

render();
