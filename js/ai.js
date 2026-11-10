// Простой компьютерный соперник: минимакс (negamax) с альфа-бета отсечением.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Chess9AI = factory(root.Chess9);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const MATE = 100000;
  const MAX_PLY = 12;

  // Оценка позиции с точки зрения белых (в сотых долях пешки).
  function evaluate(state) {
    const board = state.board;
    let score = 0;
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      if (!p) continue;
      const sign = p[0] === 'w' ? 1 : -1;
      const type = p[1];
      const f = E.fileOf(i), r = E.rankOf(i);
      const center = 8 - (Math.abs(f - 4) + Math.abs(r - 4)); // 0..8, больше — ближе к центру
      let v = VALUE[type];
      if (type === 'N') v += center * 5;
      else if (type === 'B') v += center * 3;
      else if (type === 'Q') v += center;
      else if (type === 'P') {
        const progress = sign === 1 ? r - 1 : (E.SIZE - 2) - r; // 0..7
        v += progress * 6 + (4 - Math.abs(f - 4)) * 2;
      }
      score += sign * v;
    }
    return score;
  }

  function orderMoves(moves) {
    const key = (m) => (m.captured ? 10 * VALUE[m.captured[1]] - VALUE[m.piece[1]] : 0) +
      (m.promo ? VALUE[m.promo] : 0);
    return moves.map((m) => [key(m), m]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  function negamax(state, depth, alpha, beta, ply) {
    if (depth <= 0) {
      // Не обрываем поиск посреди шаха, иначе мат на последнем ходу не будет виден.
      if (ply >= MAX_PLY || !E.inCheck(state)) {
        return evaluate(state) * (state.turn === 'w' ? 1 : -1);
      }
      depth = 1;
    }
    const moves = E.legalMoves(state);
    if (!moves.length) return E.inCheck(state) ? -MATE + ply : 0;
    if (state.halfmove >= 100) return 0;

    let best = -Infinity;
    for (const m of orderMoves(moves)) {
      const score = -negamax(E.applyMove(state, m), depth - 1, -beta, -alpha, ply + 1);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // level: 1 — лёгкий, 2 — средний, 3 — сильный.
  const SETTINGS = {
    1: { depth: 1, tolerance: 80 },
    2: { depth: 2, tolerance: 15 },
    3: { depth: 3, tolerance: 8 },
  };

  function chooseMove(state, level) {
    const moves = E.legalMoves(state);
    if (!moves.length) return null;
    const { depth, tolerance } = SETTINGS[level] || SETTINGS[2];

    let bestScore = -Infinity;
    const scored = [];
    for (const m of orderMoves(moves)) {
      const score = -negamax(E.applyMove(state, m), depth - 1, -Infinity, -(bestScore - tolerance), 1);
      scored.push([score, m]);
      if (score > bestScore) bestScore = score;
    }
    // Из почти равных по оценке ходов выбираем случайный, чтобы партии не повторялись.
    const candidates = scored.filter(([s]) => s >= bestScore - tolerance).map(([, m]) => m);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return { evaluate, chooseMove };
});
