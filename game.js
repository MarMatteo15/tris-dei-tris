// Regole e bot del "Tris dei Tris".
// 9 campi (f) da 9 caselle (c). La casella giocata decide il campo del prossimo turno.
(function (root) {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const LINES_BY_CELL = Array.from({ length: 9 }, (_, c) => LINES.filter(l => l.includes(c)));
  const opp = p => (p === 'X' ? 'O' : 'X');

  function newGame() {
    return {
      cells: Array.from({ length: 9 }, () => Array(9).fill(null)),
      fw: Array(9).fill(null), // vincitore di ogni campo: 'X' | 'O' | 'D' (pari) | null
      turn: 'X',
      active: 4, // campo obbligato, null = scelta libera
      winner: null, // 'X' | 'O' | 'D' | null
    };
  }

  function cloneGame(g) {
    return { cells: g.cells.map(r => r.slice()), fw: g.fw.slice(), turn: g.turn, active: g.active, winner: g.winner };
  }

  // 'D' non conta mai come segno di un giocatore
  function lineWinner(a) {
    for (const [x, y, z] of LINES) {
      if (a[x] && a[x] !== 'D' && a[x] === a[y] && a[y] === a[z]) return a[x];
    }
    return null;
  }

  function findLine(a, p) {
    return LINES.find(([x, y, z]) => a[x] === p && a[y] === p && a[z] === p) || null;
  }

  function legalMoves(g) {
    if (g.winner) return [];
    const fields = g.active === null ? [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(f => !g.fw[f]) : [g.active];
    const moves = [];
    for (const f of fields) for (let c = 0; c < 9; c++) if (!g.cells[f][c]) moves.push([f, c]);
    return moves;
  }

  function isLegal(g, f, c) {
    return !g.winner && !g.fw[f] && !g.cells[f][c] && (g.active === null || g.active === f);
  }

  // Esegue la mossa e restituisce il record per annullarla
  function play(g, f, c) {
    const u = { f, c, turn: g.turn, active: g.active, fw: g.fw[f], winner: g.winner };
    g.cells[f][c] = g.turn;
    if (g.fw[f] === null) {
      const w = lineWinner(g.cells[f]);
      if (w) g.fw[f] = w;
      else if (g.cells[f].every(Boolean)) g.fw[f] = 'D';
    }
    if (g.fw[f] === g.turn && lineWinner(g.fw)) g.winner = g.turn;
    else if (g.fw.every(Boolean)) g.winner = 'D';
    g.active = g.fw[c] ? null : c;
    g.turn = opp(g.turn);
    return u;
  }

  function undo(g, u) {
    g.cells[u.f][u.c] = null;
    g.fw[u.f] = u.fw;
    g.winner = u.winner;
    g.active = u.active;
    g.turn = u.turn;
  }

  // ---------- Bot ----------

  const FIELD_W = [3, 2, 3, 2, 4, 2, 3, 2, 3];

  function completes(cells, c, p) {
    for (const L of LINES_BY_CELL[c]) {
      let ok = true;
      for (const i of L) if (i !== c && cells[i] !== p) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  function potential(cells, p) {
    const q = opp(p);
    let s = 0;
    for (const [a, b, c] of LINES) {
      let m = 0, o = 0;
      for (const i of [a, b, c]) { if (cells[i] === p) m++; else if (cells[i] === q) o++; }
      if (m && !o) s += m === 2 ? 3 : 1;
      else if (o && !m) s -= o === 2 ? 3 : 1;
    }
    return s;
  }

  function evalPos(g, p, depth) {
    if (g.winner === p) return 100000 + depth;
    if (g.winner === 'D') return 0;
    if (g.winner) return -100000 - depth;
    const q = opp(p);
    let s = 0;
    for (let f = 0; f < 9; f++) {
      const w = g.fw[f];
      if (w === p) s += FIELD_W[f] * 10;
      else if (w === q) s -= FIELD_W[f] * 10;
      else if (w === null) s += potential(g.cells[f], p) * FIELD_W[f] * 0.5;
    }
    for (const [a, b, c] of LINES) {
      let m = 0, o = 0, d = 0;
      for (const i of [a, b, c]) {
        const x = g.fw[i];
        if (x === p) m++; else if (x === q) o++; else if (x === 'D') d++;
      }
      if (d) continue;
      if (m && !o) s += m === 2 ? 60 : 12;
      else if (o && !m) s -= o === 2 ? 60 : 12;
    }
    if (g.active === null) s += g.turn === p ? 8 : -8;
    return s;
  }

  function orderedMoves(g) {
    const q = opp(g.turn);
    return legalMoves(g)
      .map(([f, c]) => {
        let k = 0;
        if (completes(g.cells[f], c, g.turn)) k += 10;
        if (completes(g.cells[f], c, q)) k += 5;
        if (g.fw[c]) k -= 3; // regala la scelta libera all'avversario
        return [k, f, c];
      })
      .sort((a, b) => b[0] - a[0])
      .map(([, f, c]) => [f, c]);
  }

  function search(g, depth, alpha, beta, p, ctx) {
    if (g.winner || depth === 0) return evalPos(g, p, depth);
    if ((++ctx.n & 255) === 0 && Date.now() > ctx.deadline) ctx.abort = true;
    if (ctx.abort) return 0;
    const isMax = g.turn === p;
    let best = isMax ? -Infinity : Infinity;
    for (const [f, c] of orderedMoves(g)) {
      const u = play(g, f, c);
      const v = search(g, depth - 1, alpha, beta, p, ctx);
      undo(g, u);
      if (ctx.abort) return 0;
      if (isMax) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else { if (v < best) best = v; if (best < beta) beta = best; }
      if (alpha >= beta) break;
    }
    return best;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const pick = a => a[Math.floor(Math.random() * a.length)];

  // level: 'easy' | 'medium' | 'hard'
  function botMove(g0, level) {
    const g = cloneGame(g0);
    const p = g.turn;
    const moves = shuffle(legalMoves(g));
    if (!moves.length) return null;

    if (level === 'easy') {
      const wins = moves.filter(([f, c]) => completes(g.cells[f], c, p));
      if (wins.length && Math.random() < 0.5) return pick(wins);
      return pick(moves);
    }

    if (level === 'medium') {
      const ctx = { n: 0, deadline: Infinity, abort: false };
      const scored = moves.map(m => {
        const u = play(g, m[0], m[1]);
        const v = search(g, 1, -Infinity, Infinity, p, ctx);
        undo(g, u);
        return [m, v];
      });
      const top = Math.max(...scored.map(s => s[1]));
      return pick(scored.filter(s => s[1] >= top - 10).map(s => s[0]));
    }

    // hard: approfondimento iterativo con limite di tempo
    const ctx = { n: 0, deadline: Date.now() + 900, abort: false };
    let order = moves;
    let best = null;
    for (let d = 1; d <= 8; d++) {
      ctx.abort = false;
      let alpha = -Infinity;
      const scored = [];
      for (const m of order) {
        const u = play(g, m[0], m[1]);
        const v = search(g, d - 1, alpha, Infinity, p, ctx);
        undo(g, u);
        if (ctx.abort) break;
        scored.push([m, v]);
        if (v > alpha) alpha = v;
      }
      if (ctx.abort) break;
      scored.sort((a, b) => b[1] - a[1]);
      best = scored[0][0];
      order = scored.map(s => s[0]);
      if (scored[0][1] >= 100000) break;
    }
    return best || order[0];
  }

  const api = { LINES, newGame, cloneGame, lineWinner, findLine, legalMoves, isLegal, play, undo, botMove, opp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrisGame = api;
})(typeof self !== 'undefined' ? self : this);
