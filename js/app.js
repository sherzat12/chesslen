// Интерфейс игры: отрисовка доски, ввод ходов кликами, режим против компьютера.
(function () {
  'use strict';

  const E = window.Chess9;
  const AI = window.Chess9AI;

  // Закрашенные символы + U+FE0E, чтобы пешка не превращалась в эмодзи.
  const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const TEXT_MODE = '︎';
  const ORDER = { Q: 0, R: 1, B: 2, N: 3, P: 4 };

  const game = new E.Game();
  const ui = {
    selected: null,   // выбранная клетка
    targets: [],      // ходы выбранной фигуры
    flipped: false,
    mode: 'two',      // 'two' | 'ai'
    human: 'w',
    level: 2,
    thinking: false,
    gameId: 0,
    promoMoves: null, // варианты хода при выборе фигуры для превращения
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    board: $('board'), status: $('status'), moves: $('moves'),
    capW: $('cap-w'), capB: $('cap-b'),
    mode: $('mode'), side: $('side'), level: $('level'),
    sideWrap: $('side-wrap'), levelWrap: $('level-wrap'),
    btnNew: $('btn-new'), btnUndo: $('btn-undo'), btnFlip: $('btn-flip'),
    promo: $('promo'), promoChoices: $('promo-choices'),
  };

  const glyph = (piece) => GLYPH[piece[1]] + TEXT_MODE;

  // ---------- отрисовка ----------
  function renderBoard() {
    const st = game.state;
    const last = game.moves[game.moves.length - 1];
    const status = game.status();
    const kingSq = status.check ? E.findKing(st.board, st.turn) : -1;
    const frag = document.createDocumentFragment();

    for (let row = 0; row < E.SIZE; row++) {
      for (let col = 0; col < E.SIZE; col++) {
        const f = ui.flipped ? E.SIZE - 1 - col : col;
        const r = ui.flipped ? row : E.SIZE - 1 - row;
        const s = E.sq(f, r);
        const piece = st.board[s];

        const div = document.createElement('div');
        div.className = 'sq ' + ((f + r) % 2 === 0 ? 'dark' : 'light');
        div.dataset.sq = s;
        div.setAttribute('role', 'gridcell');
        div.setAttribute('aria-label', E.name(s) + (piece ? ', ' + piece : ''));
        if (ui.selected === s) div.classList.add('selected');
        if (last && (last.from === s || last.to === s)) div.classList.add('last');
        if (s === kingSq) div.classList.add('check');
        const target = ui.targets.find((m) => m.to === s);
        if (target) div.classList.add(target.captured ? 'capture' : 'target');

        if (piece) {
          const span = document.createElement('span');
          span.className = 'piece ' + piece[0];
          span.textContent = glyph(piece);
          div.appendChild(span);
        }
        if (col === 0) div.appendChild(coord('rank', String(r + 1)));
        if (row === E.SIZE - 1) div.appendChild(coord('file', E.FILES[f]));
        frag.appendChild(div);
      }
    }
    els.board.replaceChildren(frag);
  }

  function coord(kind, text) {
    const span = document.createElement('span');
    span.className = 'coord ' + kind;
    span.textContent = text;
    return span;
  }

  function renderStatus() {
    const s = game.status();
    const side = game.turn === 'w' ? 'белых' : 'чёрных';
    let text;
    if (s.over) {
      if (s.reason === 'checkmate') text = 'Мат. Победили ' + (s.result === '1-0' ? 'белые' : 'чёрные') + '.';
      else if (s.reason === 'stalemate') text = 'Пат. Ничья.';
      else if (s.reason === 'insufficient') text = 'Ничья: недостаточно материала.';
      else if (s.reason === 'fifty') text = 'Ничья: правило 50 ходов.';
      else text = 'Ничья: троекратное повторение позиции.';
    } else if (ui.thinking) {
      text = 'Компьютер думает…';
    } else {
      text = 'Ход ' + side + (s.check ? ' — шах!' : '');
    }
    els.status.textContent = text;
    els.status.classList.toggle('over', s.over);
  }

  function renderMoves() {
    const frag = document.createDocumentFragment();
    const add = (cls, text) => {
      const span = document.createElement('span');
      if (cls) span.className = cls;
      span.textContent = text;
      frag.appendChild(span);
    };
    const total = game.sans.length;
    for (let i = 0; i < total; i += 2) {
      add('num', i / 2 + 1 + '.');
      add(i === total - 1 ? 'last-move' : '', game.sans[i]);
      if (i + 1 < total) add(i + 1 === total - 1 ? 'last-move' : '', game.sans[i + 1]);
      else add('', '');
    }
    els.moves.replaceChildren(frag);
    els.moves.scrollTop = els.moves.scrollHeight;
  }

  function renderCaptured() {
    const took = { w: [], b: [] };
    for (const m of game.moves) if (m.captured) took[m.piece[0]].push(m.captured);
    for (const c of ['w', 'b']) {
      const target = c === 'w' ? els.capW : els.capB;
      took[c].sort((a, b) => ORDER[a[1]] - ORDER[b[1]]);
      const frag = document.createDocumentFragment();
      for (const p of took[c]) {
        const span = document.createElement('span');
        span.className = p[0];
        span.textContent = glyph(p);
        frag.appendChild(span);
      }
      target.replaceChildren(frag);
    }
  }

  function updateControls() {
    els.sideWrap.hidden = ui.mode !== 'ai';
    els.levelWrap.hidden = ui.mode !== 'ai';
    els.btnUndo.disabled = ui.thinking || game.moves.length === 0;
    els.btnNew.disabled = false;
  }

  function render() {
    renderBoard();
    renderStatus();
    renderMoves();
    renderCaptured();
    updateControls();
  }

  // ---------- ввод ходов ----------
  function clearSelection() {
    ui.selected = null;
    ui.targets = [];
  }

  function humanCanMove() {
    if (ui.thinking || ui.promoMoves || game.status().over) return false;
    return ui.mode === 'two' || game.turn === ui.human;
  }

  function onSquare(s) {
    if (!humanCanMove()) return;
    if (ui.selected !== null) {
      const candidates = ui.targets.filter((m) => m.to === s);
      if (candidates.length > 1) { openPromotion(candidates); return; }
      if (candidates.length === 1) { commit(candidates[0]); return; }
    }
    const piece = game.state.board[s];
    if (piece && piece[0] === game.turn && s !== ui.selected) {
      ui.selected = s;
      ui.targets = game.legalMoves().filter((m) => m.from === s);
    } else {
      clearSelection();
    }
    render();
  }

  function commit(move) {
    game.play(move);
    clearSelection();
    render();
    maybeComputerMove();
  }

  function openPromotion(moves) {
    ui.promoMoves = moves;
    const color = moves[0].piece[0];
    const frag = document.createDocumentFragment();
    for (const m of moves) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = color;
      btn.textContent = GLYPH[m.promo] + TEXT_MODE;
      btn.addEventListener('click', () => {
        closePromotion();
        commit(m);
      });
      frag.appendChild(btn);
    }
    els.promoChoices.replaceChildren(frag);
    els.promo.hidden = false;
  }

  function closePromotion() {
    ui.promoMoves = null;
    els.promo.hidden = true;
  }

  // ---------- компьютер ----------
  async function maybeComputerMove() {
    if (ui.mode !== 'ai' || ui.thinking) return;
    if (game.status().over || game.turn === ui.human) return;

    const id = ui.gameId;
    ui.thinking = true;
    render();
    await new Promise((resolve) => setTimeout(resolve, 40)); // даём браузеру показать статус
    if (id !== ui.gameId) { ui.thinking = false; return; }

    const move = AI.chooseMove(game.state, ui.level);
    ui.thinking = false;
    if (move) game.play(move);
    clearSelection();
    render();
  }

  // ---------- кнопки и настройки ----------
  function newGame() {
    ui.gameId++;
    ui.thinking = false;
    closePromotion();
    game.reset();
    clearSelection();
    ui.flipped = ui.mode === 'ai' && ui.human === 'b';
    render();
    maybeComputerMove();
  }

  function undo() {
    if (ui.thinking || game.moves.length === 0) return;
    game.undo();
    if (ui.mode === 'ai' && game.turn !== ui.human && game.moves.length > 0) game.undo();
    clearSelection();
    render();
    maybeComputerMove();
  }

  els.board.addEventListener('click', (e) => {
    const el = e.target.closest('.sq');
    if (el) onSquare(Number(el.dataset.sq));
  });
  els.promo.addEventListener('click', (e) => {
    if (e.target === els.promo) closePromotion();
  });
  els.btnNew.addEventListener('click', newGame);
  els.btnUndo.addEventListener('click', undo);
  els.btnFlip.addEventListener('click', () => { ui.flipped = !ui.flipped; render(); });
  els.mode.addEventListener('change', () => { ui.mode = els.mode.value; newGame(); });
  els.side.addEventListener('change', () => { ui.human = els.side.value; newGame(); });
  els.level.addEventListener('change', () => { ui.level = Number(els.level.value); });

  render();
})();
