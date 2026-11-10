const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

const at = (name) => E.sq('abcdefghi'.indexOf(name[0]), Number(name.slice(1)) - 1);
const movesFrom = (state, name) => E.legalMoves(state).filter((m) => m.from === at(name));
const count = (board, piece) => board.filter((p) => p === piece).length;

test('доска 9x9, начальная расстановка', () => {
  const st = E.initialState();
  assert.strictEqual(st.board.length, 81);
  assert.strictEqual(count(st.board, 'wP'), 9);
  assert.strictEqual(count(st.board, 'bP'), 9);
  assert.strictEqual(count(st.board, 'wK'), 1);
  assert.strictEqual(count(st.board, 'bK'), 1);
  assert.strictEqual(st.board.filter(Boolean).length, 36);
  assert.strictEqual(st.board[at('e1')], 'wK');
  assert.strictEqual(st.board[at('e9')], 'bK');
});

test('в начальной позиции у белых 24 хода', () => {
  // 9 пешек x 2 хода + 3 коня x 2 хода
  assert.strictEqual(E.legalMoves(E.initialState()).length, 24);
});

test('запись ходов: e4, Nc3', () => {
  const g = new E.Game();
  g.play(g.findMove(at('e2'), at('e4')));
  assert.strictEqual(g.sans[0], 'e4');
  g.play(g.findMove(at('a8'), at('a6')));
  g.play(g.findMove(at('b1'), at('c3')));
  assert.strictEqual(g.sans[2], 'Nc3');
});

test('мат ферзём и королём', () => {
  // чёрный король a9, белый ферзь b8 под защитой короля c7
  const g = new E.Game(E.stateFrom({ a9: 'bK', b8: 'wQ', c7: 'wK' }, 'b'));
  const s = g.status();
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.reason, 'checkmate');
  assert.strictEqual(s.result, '1-0');
});

test('пат', () => {
  const g = new E.Game(E.stateFrom({ a9: 'bK', b7: 'wQ', e1: 'wK' }, 'b'));
  const s = g.status();
  assert.strictEqual(s.reason, 'stalemate');
  assert.strictEqual(s.result, '1/2-1/2');
});

test('недостаточно материала и правило 50 ходов', () => {
  assert.strictEqual(new E.Game(E.stateFrom({ e1: 'wK', e9: 'bK' }, 'w')).status().reason, 'insufficient');
  assert.strictEqual(new E.Game(E.stateFrom({ e1: 'wK', e9: 'bK', c3: 'wB' }, 'w')).status().reason, 'insufficient');
  const st = E.stateFrom({ e1: 'wK', e9: 'bK', a1: 'wR' }, 'w', { halfmove: 100 });
  assert.strictEqual(new E.Game(st).status().reason, 'fifty');
});

test('короткая рокировка', () => {
  const st = E.stateFrom({ e1: 'wK', i1: 'wR', e9: 'bK' }, 'w', { castling: { wK: true, wQ: false, bK: false, bQ: false } });
  const castle = movesFrom(st, 'e1').find((m) => m.flag === 'castleK');
  assert.ok(castle, 'рокировка должна быть доступна');
  const next = E.applyMove(st, castle);
  assert.strictEqual(next.board[at('g1')], 'wK');
  assert.strictEqual(next.board[at('f1')], 'wR');
  assert.strictEqual(next.board[at('e1')], null);
  assert.strictEqual(next.board[at('i1')], null);
  assert.strictEqual(next.castling.wK, false);
});

test('длинная рокировка', () => {
  const st = E.stateFrom({ e1: 'wK', a1: 'wR', e9: 'bK' }, 'w', { castling: { wK: false, wQ: true, bK: false, bQ: false } });
  const castle = movesFrom(st, 'e1').find((m) => m.flag === 'castleQ');
  assert.ok(castle);
  const next = E.applyMove(st, castle);
  assert.strictEqual(next.board[at('c1')], 'wK');
  assert.strictEqual(next.board[at('d1')], 'wR');
});

test('рокировка запрещена через битое поле и под шахом', () => {
  const castling = { wK: true, wQ: false, bK: false, bQ: false };
  const through = E.stateFrom({ e1: 'wK', i1: 'wR', e9: 'bK', f9: 'bR' }, 'w', { castling });
  assert.ok(!movesFrom(through, 'e1').some((m) => m.flag === 'castleK'));
  const inCheck = E.stateFrom({ e1: 'wK', i1: 'wR', e9: 'bK', e5: 'bR' }, 'w', { castling });
  assert.ok(!movesFrom(inCheck, 'e1').some((m) => m.flag === 'castleK'));
  const blocked = E.stateFrom({ e1: 'wK', i1: 'wR', h1: 'wN', e9: 'bK' }, 'w', { castling });
  assert.ok(!movesFrom(blocked, 'e1').some((m) => m.flag === 'castleK'));
});

test('взятие на проходе', () => {
  const g = new E.Game(E.stateFrom({ e1: 'wK', e9: 'bK', e6: 'wP', d8: 'bP' }, 'b'));
  g.play(g.findMove(at('d8'), at('d6')));
  const ep = g.legalMoves().find((m) => m.flag === 'ep');
  assert.ok(ep, 'взятие на проходе должно быть доступно');
  assert.strictEqual(ep.from, at('e6'));
  assert.strictEqual(ep.to, at('d7'));
  g.play(ep);
  assert.strictEqual(g.state.board[at('d6')], null, 'побитая пешка исчезла');
  assert.strictEqual(g.state.board[at('d7')], 'wP');
});

test('превращение пешки в четыре фигуры', () => {
  const st = E.stateFrom({ e1: 'wK', e8: 'bK', a8: 'wP' }, 'w');
  const promos = movesFrom(st, 'a8').map((m) => m.promo).sort();
  assert.deepStrictEqual(promos, ['B', 'N', 'Q', 'R']);
  const g = new E.Game(st);
  g.play(g.findMove(at('a8'), at('a9'), 'N'));
  assert.strictEqual(g.state.board[at('a9')], 'wN');
  assert.match(g.sans[0], /^a9=N/);
});

test('связанная фигура не может ходить', () => {
  const st = E.stateFrom({ e1: 'wK', e2: 'wR', e9: 'bR', a9: 'bK' }, 'w');
  const rookMoves = movesFrom(st, 'e2');
  assert.ok(rookMoves.every((m) => E.fileOf(m.to) === 4), 'ладья остаётся на линии связки');
});

test('отмена хода возвращает позицию', () => {
  const g = new E.Game();
  const before = JSON.stringify(g.state.board);
  g.play(g.findMove(at('e2'), at('e4')));
  g.undo();
  assert.strictEqual(JSON.stringify(g.state.board), before);
  assert.strictEqual(g.turn, 'w');
  assert.strictEqual(g.moves.length, 0);
});

test('случайные партии: король всегда на месте, ходы корректны', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let game = 0; game < 40; game++) {
    const g = new E.Game();
    for (let ply = 0; ply < 250 && !g.status().over; ply++) {
      const legal = g.legalMoves();
      assert.ok(legal.length > 0);
      g.play(legal[rnd(legal.length)]);
      const board = g.state.board;
      assert.strictEqual(count(board, 'wK'), 1);
      assert.strictEqual(count(board, 'bK'), 1);
      assert.ok(!E.inCheck(g.state, E.other(g.turn)), 'сторона, сделавшая ход, не может оставить короля под шахом');
    }
  }
});

test('компьютер выбирает легальный ход и видит мат в один ход', () => {
  const st = E.initialState();
  for (const level of [1, 2]) {
    const m = AI.chooseMove(st, level);
    assert.ok(E.legalMoves(st).some((x) => x.from === m.from && x.to === m.to));
  }
  // Мат в один ход: Qh8-b8#, король c7 прикрывает ферзя
  const mateIn1 = E.stateFrom({ a9: 'bK', c7: 'wK', h8: 'wQ' }, 'w');
  const best = AI.chooseMove(mateIn1, 2);
  const g = new E.Game(mateIn1);
  g.play(best);
  assert.strictEqual(g.status().reason, 'checkmate');
});
