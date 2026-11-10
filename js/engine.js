// Движок шахмат на доске 9x9: генерация ходов, проверка шаха, мат, пат, ничьи.
// Работает и в браузере (window.Chess9), и в Node.js (require) без зависимостей.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Chess9 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 9;
  const FILES = 'abcdefghi';

  // Расстановка фигур на 1-й (белые) и 9-й (чёрные) горизонтали, слева направо (a..i).
  // Чтобы изменить вариант игры, достаточно поменять этот массив.
  const BACK_RANK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'N', 'R'];

  const KING_FILE = BACK_RANK.indexOf('K'); // вертикаль короля (e)
  const LONG_ROOK_FILE = 0;                 // ладья для длинной рокировки (a)
  const SHORT_ROOK_FILE = SIZE - 1;         // ладья для короткой рокировки (i)

  const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const KING = ORTH.concat(DIAG);
  const SLIDE = { B: DIAG, R: ORTH, Q: ORTH.concat(DIAG) };

  // Клетка = rank * 9 + file; rank 0 — первая горизонталь (белые снизу).
  const sq = (f, r) => r * SIZE + f;
  const fileOf = (s) => s % SIZE;
  const rankOf = (s) => Math.floor(s / SIZE);
  const inBoard = (f, r) => f >= 0 && f < SIZE && r >= 0 && r < SIZE;
  const name = (s) => FILES[fileOf(s)] + (rankOf(s) + 1);
  const other = (c) => (c === 'w' ? 'b' : 'w');

  function initialState() {
    const board = new Array(SIZE * SIZE).fill(null);
    for (let f = 0; f < SIZE; f++) {
      board[sq(f, 0)] = 'w' + BACK_RANK[f];
      board[sq(f, 1)] = 'wP';
      board[sq(f, SIZE - 2)] = 'bP';
      board[sq(f, SIZE - 1)] = 'b' + BACK_RANK[f];
    }
    return {
      board,
      turn: 'w',
      castling: { wK: true, wQ: true, bK: true, bQ: true }, // K — короткая, Q — длинная
      ep: -1,        // клетка, через которую можно взять на проходе
      halfmove: 0,   // счётчик для правила 50 ходов (в полуходах)
      fullmove: 1,
    };
  }

  // Удобно для тестов: stateFrom({ e1: 'wK', e9: 'bK' }, 'w')
  function stateFrom(pieces, turn, extra) {
    const board = new Array(SIZE * SIZE).fill(null);
    for (const [n, p] of Object.entries(pieces)) {
      board[sq(FILES.indexOf(n[0]), Number(n.slice(1)) - 1)] = p;
    }
    return Object.assign({
      board,
      turn: turn || 'w',
      castling: { wK: false, wQ: false, bK: false, bQ: false },
      ep: -1,
      halfmove: 0,
      fullmove: 1,
    }, extra || {});
  }

  function findKing(board, color) {
    const k = color + 'K';
    for (let i = 0; i < board.length; i++) if (board[i] === k) return i;
    return -1;
  }

  // Бьёт ли сторона `by` клетку `target`.
  function isAttacked(board, target, by) {
    const tf = fileOf(target);
    const tr = rankOf(target);
    const dir = by === 'w' ? 1 : -1;
    for (const df of [-1, 1]) {
      const f = tf + df, r = tr - dir;
      if (inBoard(f, r) && board[sq(f, r)] === by + 'P') return true;
    }
    for (const [df, dr] of KNIGHT) {
      const f = tf + df, r = tr + dr;
      if (inBoard(f, r) && board[sq(f, r)] === by + 'N') return true;
    }
    for (const [df, dr] of KING) {
      const f = tf + df, r = tr + dr;
      if (inBoard(f, r) && board[sq(f, r)] === by + 'K') return true;
    }
    for (const [df, dr] of ORTH) {
      let f = tf + df, r = tr + dr;
      while (inBoard(f, r)) {
        const p = board[sq(f, r)];
        if (p) { if (p === by + 'R' || p === by + 'Q') return true; break; }
        f += df; r += dr;
      }
    }
    for (const [df, dr] of DIAG) {
      let f = tf + df, r = tr + dr;
      while (inBoard(f, r)) {
        const p = board[sq(f, r)];
        if (p) { if (p === by + 'B' || p === by + 'Q') return true; break; }
        f += df; r += dr;
      }
    }
    return false;
  }

  function inCheck(state, color) {
    const c = color || state.turn;
    const k = findKing(state.board, c);
    return k >= 0 && isAttacked(state.board, k, other(c));
  }

  // Ходы без проверки, не остаётся ли свой король под шахом.
  function pseudoMoves(state) {
    const { board, castling, ep } = state;
    const me = state.turn;
    const opp = other(me);
    const moves = [];

    for (let s = 0; s < board.length; s++) {
      const p = board[s];
      if (!p || p[0] !== me) continue;
      const type = p[1];
      const f = fileOf(s), r = rankOf(s);

      if (type === 'P') {
        const dir = me === 'w' ? 1 : -1;
        const startRank = me === 'w' ? 1 : SIZE - 2;
        const promoRank = me === 'w' ? SIZE - 1 : 0;
        const addPawn = (to, captured) => {
          if (rankOf(to) === promoRank) {
            for (const promo of ['Q', 'R', 'B', 'N']) {
              moves.push({ from: s, to, piece: p, captured, promo });
            }
          } else {
            moves.push({ from: s, to, piece: p, captured });
          }
        };
        const r1 = r + dir;
        if (inBoard(f, r1) && !board[sq(f, r1)]) {
          addPawn(sq(f, r1));
          const r2 = r + 2 * dir;
          if (r === startRank && !board[sq(f, r2)]) {
            moves.push({ from: s, to: sq(f, r2), piece: p, flag: 'double' });
          }
        }
        for (const df of [-1, 1]) {
          const nf = f + df;
          if (!inBoard(nf, r1)) continue;
          const t = sq(nf, r1);
          const tp = board[t];
          if (tp && tp[0] === opp) addPawn(t, tp);
          else if (!tp && t === ep) {
            moves.push({ from: s, to: t, piece: p, captured: opp + 'P', flag: 'ep' });
          }
        }
      } else if (type === 'N' || type === 'K') {
        for (const [df, dr] of (type === 'N' ? KNIGHT : KING)) {
          const nf = f + df, nr = r + dr;
          if (!inBoard(nf, nr)) continue;
          const t = sq(nf, nr);
          const tp = board[t];
          if (!tp || tp[0] === opp) moves.push({ from: s, to: t, piece: p, captured: tp || undefined });
        }
        if (type === 'K' && f === KING_FILE && r === (me === 'w' ? 0 : SIZE - 1) && !isAttacked(board, s, opp)) {
          const empty = (from, to) => {
            for (let x = from; x <= to; x++) if (board[sq(x, r)]) return false;
            return true;
          };
          const safe = (x) => !isAttacked(board, sq(x, r), opp);
          if (castling[me + 'K'] && board[sq(SHORT_ROOK_FILE, r)] === me + 'R' &&
              empty(KING_FILE + 1, SHORT_ROOK_FILE - 1) && safe(KING_FILE + 1) && safe(KING_FILE + 2)) {
            moves.push({ from: s, to: sq(KING_FILE + 2, r), piece: p, flag: 'castleK' });
          }
          if (castling[me + 'Q'] && board[sq(LONG_ROOK_FILE, r)] === me + 'R' &&
              empty(LONG_ROOK_FILE + 1, KING_FILE - 1) && safe(KING_FILE - 1) && safe(KING_FILE - 2)) {
            moves.push({ from: s, to: sq(KING_FILE - 2, r), piece: p, flag: 'castleQ' });
          }
        }
      } else {
        for (const [df, dr] of SLIDE[type]) {
          let nf = f + df, nr = r + dr;
          while (inBoard(nf, nr)) {
            const t = sq(nf, nr);
            const tp = board[t];
            if (!tp) moves.push({ from: s, to: t, piece: p });
            else {
              if (tp[0] === opp) moves.push({ from: s, to: t, piece: p, captured: tp });
              break;
            }
            nf += df; nr += dr;
          }
        }
      }
    }
    return moves;
  }

  const CORNERS = {
    [sq(LONG_ROOK_FILE, 0)]: 'wQ',
    [sq(SHORT_ROOK_FILE, 0)]: 'wK',
    [sq(LONG_ROOK_FILE, SIZE - 1)]: 'bQ',
    [sq(SHORT_ROOK_FILE, SIZE - 1)]: 'bK',
  };

  // Возвращает новое состояние (исходное не меняется).
  function applyMove(state, m) {
    const board = state.board.slice();
    const me = m.piece[0];
    const castling = Object.assign({}, state.castling);

    board[m.to] = m.promo ? me + m.promo : m.piece;
    board[m.from] = null;

    if (m.flag === 'ep') board[sq(fileOf(m.to), rankOf(m.from))] = null;
    if (m.flag === 'castleK') {
      const r = rankOf(m.from);
      board[sq(KING_FILE + 1, r)] = me + 'R';
      board[sq(SHORT_ROOK_FILE, r)] = null;
    }
    if (m.flag === 'castleQ') {
      const r = rankOf(m.from);
      board[sq(KING_FILE - 1, r)] = me + 'R';
      board[sq(LONG_ROOK_FILE, r)] = null;
    }

    if (m.piece[1] === 'K') { castling[me + 'K'] = false; castling[me + 'Q'] = false; }
    if (CORNERS[m.from]) castling[CORNERS[m.from]] = false;
    if (CORNERS[m.to]) castling[CORNERS[m.to]] = false;

    const ep = m.flag === 'double' ? sq(fileOf(m.from), (rankOf(m.from) + rankOf(m.to)) / 2) : -1;
    return {
      board,
      turn: other(me),
      castling,
      ep,
      halfmove: (m.piece[1] === 'P' || m.captured) ? 0 : state.halfmove + 1,
      fullmove: state.fullmove + (me === 'b' ? 1 : 0),
    };
  }

  function legalMoves(state) {
    const me = state.turn;
    const opp = other(me);
    return pseudoMoves(state).filter((m) => {
      const next = applyMove(state, m);
      const k = findKing(next.board, me);
      return k >= 0 && !isAttacked(next.board, k, opp);
    });
  }

  function insufficientMaterial(board) {
    const rest = board.filter((p) => p && p[1] !== 'K');
    if (rest.length === 0) return true;
    return rest.length === 1 && (rest[0][1] === 'N' || rest[0][1] === 'B');
  }

  function positionKey(st) {
    if (st._key) return st._key;
    let k = '';
    for (let i = 0; i < st.board.length; i++) k += st.board[i] || '--';
    k += st.turn + (st.castling.wK ? 'K' : '') + (st.castling.wQ ? 'Q' : '') +
      (st.castling.bK ? 'k' : '') + (st.castling.bQ ? 'q' : '') + st.ep;
    st._key = k;
    return k;
  }

  // Запись хода в алгебраической нотации (SAN): Nc3, exd5, O-O, e8=Q+, Qh5#.
  function toSAN(state, m, legal) {
    let s;
    if (m.flag === 'castleK') s = 'O-O';
    else if (m.flag === 'castleQ') s = 'O-O-O';
    else {
      const type = m.piece[1];
      s = '';
      if (type === 'P') {
        if (m.captured) s += FILES[fileOf(m.from)] + 'x';
        s += name(m.to);
        if (m.promo) s += '=' + m.promo;
      } else {
        s += type;
        const rivals = (legal || legalMoves(state)).filter(
          (o) => o !== m && o.piece === m.piece && o.to === m.to);
        if (rivals.length) {
          const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
          const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(m.from));
          if (!sameFile) s += FILES[fileOf(m.from)];
          else if (!sameRank) s += rankOf(m.from) + 1;
          else s += name(m.from);
        }
        if (m.captured) s += 'x';
        s += name(m.to);
      }
    }
    const next = applyMove(state, m);
    if (inCheck(next)) s += legalMoves(next).length ? '+' : '#';
    return s;
  }

  // Партия: история позиций, ходов и их записей.
  class Game {
    constructor(state) { this.reset(state); }

    reset(state) {
      this.states = [state || initialState()];
      this.moves = [];
      this.sans = [];
      this._cache = null;
    }

    get state() { return this.states[this.states.length - 1]; }
    get turn() { return this.state.turn; }

    legalMoves() {
      if (!this._cache) this._cache = legalMoves(this.state);
      return this._cache;
    }

    // promo — буква фигуры ('Q', 'R', 'B', 'N') для превращения пешки.
    findMove(from, to, promo) {
      return this.legalMoves().find(
        (m) => m.from === from && m.to === to && m.promo === (promo || undefined)) || null;
    }

    play(move) {
      const legal = this.legalMoves();
      let m = legal.includes(move) ? move : legal.find(
        (x) => x.from === move.from && x.to === move.to && x.promo === move.promo);
      if (!m) return null;
      const san = toSAN(this.state, m, legal);
      this.states.push(applyMove(this.state, m));
      this.moves.push(m);
      this.sans.push(san);
      this._cache = null;
      return m;
    }

    undo() {
      if (!this.moves.length) return null;
      this.states.pop();
      this.sans.pop();
      this._cache = null;
      return this.moves.pop();
    }

    status() {
      const st = this.state;
      const check = inCheck(st);
      if (!this.legalMoves().length) {
        return check
          ? { over: true, result: st.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate', check: true }
          : { over: true, result: '1/2-1/2', reason: 'stalemate', check: false };
      }
      const draw = (reason) => ({ over: true, result: '1/2-1/2', reason, check });
      if (insufficientMaterial(st.board)) return draw('insufficient');
      if (st.halfmove >= 100) return draw('fifty');
      const key = positionKey(st);
      let count = 0;
      for (const s of this.states) if (positionKey(s) === key) count++;
      if (count >= 3) return draw('repetition');
      return { over: false, result: null, reason: null, check };
    }
  }

  return {
    SIZE, FILES, BACK_RANK,
    sq, fileOf, rankOf, name, other,
    initialState, stateFrom, findKing,
    isAttacked, inCheck, pseudoMoves, legalMoves, applyMove,
    insufficientMaterial, toSAN, Game,
  };
});
