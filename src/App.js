import { useState, useEffect, useCallback, useRef } from "react";

const SIZE = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;

const newBoard = () => Array(SIZE).fill(null).map(() => Array(SIZE).fill(EMPTY));
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

function lineInfo(board, r, c, dr, dc, color) {
  let nr, nc;
  nr = r + dr; nc = c + dc;
  let cntF = 0;
  while (inBounds(nr, nc) && board[nr][nc] === color) { cntF++; nr += dr; nc += dc; }
  let openF = inBounds(nr, nc) && board[nr][nc] === EMPTY;
  nr = r - dr; nc = c - dc;
  let cntB = 0;
  while (inBounds(nr, nc) && board[nr][nc] === color) { cntB++; nr -= dr; nc -= dc; }
  let openB = inBounds(nr, nc) && board[nr][nc] === EMPTY;
  return { count: 1 + cntF + cntB, openF, openB };
}

function checkWin(board, r, c, color) {
  for (const [dr, dc] of DIRS) {
    const { count } = lineInfo(board, r, c, dr, dc, color);
    if (color === WHITE && count >= 5) return true;
    if (color === BLACK && count === 5) return true;
  }
  return false;
}

function getWinCells(board, r, c, color) {
  for (const [dr, dc] of DIRS) {
    const cells = [[r, c]];
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && board[nr][nc] === color) { cells.push([nr, nc]); nr += dr; nc += dc; }
    nr = r - dr; nc = c - dc;
    while (inBounds(nr, nc) && board[nr][nc] === color) { cells.push([nr, nc]); nr -= dr; nc -= dc; }
    if (color === WHITE && cells.length >= 5) return cells;
    if (color === BLACK && cells.length === 5) return cells;
  }
  return [];
}

// ── 렌주룰 ──────────────────────────────────────────────
function isOverline(board, r, c) {
  for (const [dr, dc] of DIRS) {
    const { count } = lineInfo(board, r, c, dr, dc, BLACK);
    if (count >= 6) return true;
  }
  return false;
}

function isOpenThreeOnBoard(board, r, c, dr, dc) {
  const { count, openF, openB } = lineInfo(board, r, c, dr, dc, BLACK);
  return count === 3 && openF && openB;
}

function countOpenThrees(board, r, c) {
  const tmp = board.map(row => [...row]);
  tmp[r][c] = BLACK;
  let cnt = 0;
  for (const [dr, dc] of DIRS) if (isOpenThreeOnBoard(tmp, r, c, dr, dc)) cnt++;
  return cnt;
}

function countFours(board, r, c) {
  const tmp = board.map(row => [...row]);
  tmp[r][c] = BLACK;
  let cnt = 0;
  for (const [dr, dc] of DIRS) {
    const { count } = lineInfo(tmp, r, c, dr, dc, BLACK);
    if (count === 4) cnt++;
  }
  return cnt;
}

function isForbidden(board, r, c) {
  if (board[r][c] !== EMPTY) return false;
  if (isOverline(board, r, c)) return true;
  if (countFours(board, r, c) >= 2) return true;
  if (countOpenThrees(board, r, c) >= 2) return true;
  return false;
}

// ── 강화된 평가함수 ──────────────────────────────────────
const SCORE = {
  five:      1000000,
  openFour:   100000,
  four:        10000,
  openThree:    5000,
  three:        1000,
  openTwo:       200,
  two:            50,
  one:            10,
};

function evalLine(count, openF, openB) {
  const opens = (openF ? 1 : 0) + (openB ? 1 : 0);
  if (count >= 5) return SCORE.five;
  if (count === 4) return opens === 2 ? SCORE.openFour : SCORE.four;
  if (count === 3) return opens === 2 ? SCORE.openThree : SCORE.three;
  if (count === 2) return opens === 2 ? SCORE.openTwo : SCORE.two;
  if (count === 1) return opens === 2 ? SCORE.one : 0;
  return 0;
}

function scorePosition(board, r, c, color) {
  let s = 0;
  for (const [dr, dc] of DIRS) {
    const { count, openF, openB } = lineInfo(board, r, c, dr, dc, color);
    s += evalLine(count, openF, openB);
  }
  return s;
}

// 복합 위협 점수 (쌍3, 쌍4 보너스)
function threatScore(board, r, c, color) {
  const tmp = board.map(row => [...row]);
  tmp[r][c] = color;
  let openThrees = 0, fours = 0, openFours = 0;
  for (const [dr, dc] of DIRS) {
    const { count, openF, openB } = lineInfo(tmp, r, c, dr, dc, color);
    const opens = (openF ? 1 : 0) + (openB ? 1 : 0);
    if (count === 3 && opens === 2) openThrees++;
    if (count === 4 && opens === 1) fours++;
    if (count === 4 && opens === 2) openFours++;
  }
  let bonus = 0;
  if (openFours >= 1) bonus += 500000;       // 열린4 = 즉시 위협
  if (fours >= 2) bonus += 200000;           // 44
  if (fours >= 1 && openThrees >= 1) bonus += 150000; // 43
  if (openThrees >= 2) bonus += 80000;       // 33
  return bonus;
}

function getCandidates(board) {
  const visited = new Set();
  const cands = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (board[r][c] !== EMPTY)
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
              const key = nr * SIZE + nc;
              if (!visited.has(key)) { visited.add(key); cands.push([nr, nc]); }
            }
          }
  if (cands.length === 0) cands.push([7, 7]);
  return cands;
}

// ── 강화된 AI ────────────────────────────────────────────
function aiMove(board, color, difficulty) {
  const opp = color === BLACK ? WHITE : BLACK;
  const cands = getCandidates(board);

  // 즉시 승리 체크
  for (const [r, c] of cands) {
    if (color === BLACK && isForbidden(board, r, c)) continue;
    const tmp = board.map(row => [...row]); tmp[r][c] = color;
    if (checkWin(tmp, r, c, color)) return [r, c];
  }
  // 즉시 차단
  for (const [r, c] of cands) {
    if (color === BLACK && isForbidden(board, r, c)) continue;
    const tmp = board.map(row => [...row]); tmp[r][c] = opp;
    if (checkWin(tmp, r, c, opp)) return [r, c];
  }

  if (difficulty === 0) {
    // 초보: 약한 휴리스틱
    let best = null, bestScore = -Infinity;
    for (const [r, c] of cands) {
      if (color === BLACK && isForbidden(board, r, c)) continue;
      const s = Math.random() * 100 + scorePosition(board, r, c, color) * 0.5 + scorePosition(board, r, c, opp) * 0.3;
      if (s > bestScore) { bestScore = s; best = [r, c]; }
    }
    return best || cands[0];
  }

  // 후보 정렬 (좋은 수 먼저)
  const scored = cands
    .filter(([r, c]) => !(color === BLACK && isForbidden(board, r, c)))
    .map(([r, c]) => {
      const atk = scorePosition(board, r, c, color) + threatScore(board, r, c, color);
      const def = scorePosition(board, r, c, opp) + threatScore(board, r, c, opp);
      return { r, c, s: atk * 1.3 + def };
    })
    .sort((a, b) => b.s - a.s);

  if (difficulty === 1) {
    // 중수: 향상된 휴리스틱 + 열린4 즉시 공격
    // 열린4 공격 먼저
    for (const { r, c } of scored.slice(0, 20)) {
      const tmp = board.map(row => [...row]); tmp[r][c] = color;
      let openFours = 0;
      for (const [dr, dc] of DIRS) {
        const { count, openF, openB } = lineInfo(tmp, r, c, dr, dc, color);
        if (count === 4 && openF && openB) openFours++;
      }
      if (openFours >= 1) return [r, c];
    }
    return scored[0] ? [scored[0].r, scored[0].c] : cands[0];
  }

  // 고수: 미니맥스 depth=3 + 알파베타
  function evaluate(b) {
    let total = 0;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (b[r][c] === EMPTY) {
          total += scorePosition(b, r, c, color) * 0.5;
          total -= scorePosition(b, r, c, opp) * 0.5;
        }
    return total;
  }

  function minimax(b, depth, isMax, alpha, beta, turn) {
    const moves = getCandidates(b)
      .filter(([r, c]) => !(turn === BLACK && isForbidden(b, r, c)))
      .map(([r, c]) => {
        const s = scorePosition(b, r, c, turn) + threatScore(b, r, c, turn) +
                  scorePosition(b, r, c, turn === BLACK ? WHITE : BLACK) * 0.8;
        return { r, c, s };
      })
      .sort((a, b2) => b2.s - a.s)
      .slice(0, depth === 3 ? 12 : 8);

    if (depth === 0 || moves.length === 0) return evaluate(b);

    if (isMax) {
      let val = -Infinity;
      for (const { r, c } of moves) {
        b[r][c] = turn;
        if (checkWin(b, r, c, turn)) { b[r][c] = EMPTY; return SCORE.five; }
        val = Math.max(val, minimax(b, depth - 1, false, alpha, beta, turn === BLACK ? WHITE : BLACK));
        b[r][c] = EMPTY;
        alpha = Math.max(alpha, val);
        if (beta <= alpha) break;
      }
      return val;
    } else {
      let val = Infinity;
      const oppTurn = turn === BLACK ? WHITE : BLACK;
      const oppMoves = getCandidates(b)
        .filter(([r, c]) => !(oppTurn === BLACK && isForbidden(b, r, c)))
        .map(([r, c]) => ({ r, c, s: scorePosition(b, r, c, oppTurn) + threatScore(b, r, c, oppTurn) }))
        .sort((a, b2) => b2.s - a.s).slice(0, 8);
      for (const { r, c } of oppMoves) {
        b[r][c] = oppTurn;
        if (checkWin(b, r, c, oppTurn)) { b[r][c] = EMPTY; return -SCORE.five; }
        val = Math.min(val, minimax(b, depth - 1, true, alpha, beta, turn));
        b[r][c] = EMPTY;
        beta = Math.min(beta, val);
        if (beta <= alpha) break;
      }
      return val;
    }
  }

  let best = null, bestScore = -Infinity;
  for (const { r, c } of scored.slice(0, 15)) {
    const tmp = board.map(row => [...row]);
    tmp[r][c] = color;
    if (checkWin(tmp, r, c, color)) return [r, c];
    const s = minimax(tmp, 3, false, -Infinity, Infinity, color === BLACK ? WHITE : BLACK);
    if (s > bestScore) { bestScore = s; best = [r, c]; }
  }
  return best || (scored[0] ? [scored[0].r, scored[0].c] : cands[0]);
}

// ── 반응형 보드 크기 계산 ────────────────────────────────
function useBoardSize() {
  const [size, setSize] = useState(() => {
    const w = window.innerWidth, h = window.innerHeight;
    const maxPx = Math.min(w * 0.97, h * 0.62, 560);
    return Math.max(280, maxPx);
  });
  useEffect(() => {
    const fn = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const maxPx = Math.min(w * 0.97, h * 0.62, 560);
      setSize(Math.max(280, maxPx));
    };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return size;
}

// ── 컴포넌트 ─────────────────────────────────────────────
export default function App() {
  const boardPx = useBoardSize();
  const PAD = boardPx * 0.045;
  const CELL = (boardPx - PAD * 2) / (SIZE - 1);
  const R = CELL * 0.46;

  const [board, setBoard] = useState(newBoard());
  const [turn, setTurn] = useState(BLACK);
  const [winner, setWinner] = useState(null);
  const [winCells, setWinCells] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState(null);
  const [playerColor, setPlayerColor] = useState(BLACK);
  const [aiDiff, setAiDiff] = useState(1);
  const [aiDiff2, setAiDiff2] = useState(1);
  const [avaSpeed, setAvaSpeed] = useState(600);
  const [avaRunning, setAvaRunning] = useState(false);
  const [forbiddenCells, setForbiddenCells] = useState([]);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [moveCount, setMoveCount] = useState(0);
  const avaRef = useRef(false);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  boardRef.current = board;
  turnRef.current = turn;

  useEffect(() => {
    if (winner || turn !== BLACK) { setForbiddenCells([]); return; }
    const fc = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (board[r][c] === EMPTY && isForbidden(board, r, c)) fc.push([r, c]);
    setForbiddenCells(fc);
  }, [board, turn, winner]);

  const place = useCallback((b, r, c, color) => {
    if (b[r][c] !== EMPTY) return null;
    if (color === BLACK && isForbidden(b, r, c)) return null;
    const nb = b.map(row => [...row]); nb[r][c] = color;
    return nb;
  }, []);

  const afterPlace = useCallback((nb, r, c, color) => {
    const won = checkWin(nb, r, c, color);
    return { won, wc: won ? getWinCells(nb, r, c, color) : [] };
  }, []);

  const handleClick = useCallback((r, c) => {
    if (winner || mode === 'ava') return;
    if (mode === 'pva' && turn !== playerColor) return;
    const nb = place(board, r, c, turn);
    if (!nb) return;
    const { won, wc } = afterPlace(nb, r, c, turn);
    setHistory(h => [...h, { board: board.map(row => [...row]), turn, lastMove }]);
    setBoard(nb); setLastMove([r, c]); setMoveCount(p => p + 1);
    if (won) { setWinner(turn); setWinCells(wc); return; }
    setTurn(t => t === BLACK ? WHITE : BLACK);
  }, [board, turn, winner, mode, playerColor, place, afterPlace, lastMove]);

  // PvA AI
  useEffect(() => {
    if (mode !== 'pva' || winner || turn === playerColor) return;
    const aiColor = turn, diff = aiDiff;
    const timer = setTimeout(() => {
      const b = boardRef.current;
      const mv = aiMove(b, aiColor, diff);
      if (!mv) return;
      const [r, c] = mv;
      const nb = b.map(row => [...row]); nb[r][c] = aiColor;
      const { won, wc } = afterPlace(nb, r, c, aiColor);
      setBoard(nb); setLastMove([r, c]); setMoveCount(p => p + 1);
      if (won) { setWinner(aiColor); setWinCells(wc); return; }
      setTurn(t => t === BLACK ? WHITE : BLACK);
    }, 400);
    return () => clearTimeout(timer);
  }, [turn, mode, playerColor, winner, aiDiff, afterPlace]);

  // AvA AI
  useEffect(() => {
    if (mode !== 'ava' || !avaRunning || winner) return;
    avaRef.current = true;
    const color = turnRef.current;
    const diff = color === BLACK ? aiDiff : aiDiff2;
    const timer = setTimeout(() => {
      if (!avaRef.current) return;
      const b = boardRef.current;
      const mv = aiMove(b, color, diff);
      if (!mv) return;
      const [r, c] = mv;
      const nb = b.map(row => [...row]); nb[r][c] = color;
      const { won, wc } = afterPlace(nb, r, c, color);
      setBoard(nb); setLastMove([r, c]); setMoveCount(p => p + 1);
      if (won) { setWinner(color); setWinCells(wc); setAvaRunning(false); return; }
      setTurn(t => t === BLACK ? WHITE : BLACK);
    }, avaSpeed);
    return () => { clearTimeout(timer); };
  }, [turn, mode, avaRunning, winner, aiDiff, aiDiff2, avaSpeed, afterPlace]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setBoard(last.board); setTurn(last.turn); setLastMove(last.lastMove);
    setHistory(h => h.slice(0, -1)); setWinner(null); setWinCells([]);
    setMoveCount(p => Math.max(0, p - 1));
  };

  const resetGame = () => {
    avaRef.current = false;
    setBoard(newBoard()); setTurn(BLACK); setWinner(null); setWinCells([]);
    setLastMove(null); setHistory([]); setMoveCount(0);
    setAvaRunning(false); setForbiddenCells([]);
  };

  const startMode = m => { resetGame(); setMode(m); };
  const isForbiddenCell = (r, c) => forbiddenCells.some(([fr, fc]) => fr === r && fc === c);
  const isWinCell = (r, c) => winCells.some(([wr, wc]) => wr === r && wc === c);
  const isLastMove = (r, c) => lastMove && lastMove[0] === r && lastMove[1] === c;
  const diffLabel = d => ['초보', '중수', '고수'][d];

  // ── 메뉴 ───────────────────────────────────────────────
  if (!mode) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a0a00,#3d1f00,#1a0a00)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 52 }}>⚫⚪</div>
        <h1 style={{ color: '#f5d77e', fontSize: 'clamp(24px,6vw,36px)', fontWeight: 900, margin: '8px 0 4px', textShadow: '0 2px 8px #000' }}>알렉스의 오목</h1>
        <p style={{ color: '#c8a96e', fontSize: 13, margin: 0 }}>공식 렌주룰 적용</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 280 }}>
        {[['pvp','👥 2인 대전','두 명이 함께 플레이'],['pva','🤖 AI 대전','AI와 대결'],['ava','🎬 AI vs AI','AI 대국 관람']].map(([m,label,sub]) => (
          <button key={m} onClick={() => startMode(m)}
            style={{ background: 'linear-gradient(135deg,#8B4513,#D2691E)', color: '#fff', border: '2px solid #f5d77e', borderRadius: 14, padding: '14px 20px', fontSize: 17, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px #0008' }}>
            {label}
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>{sub}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ── 설정 패널 ──────────────────────────────────────────
  const BtnSm = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{ padding: '4px 9px', borderRadius: 7, border: active ? '2px solid #f5d77e' : '2px solid #555', background: active ? '#8B4513' : '#333', color: '#fff', cursor: 'pointer', fontSize: 12, marginLeft: 4 }}>{children}</button>
  );

  const renderSettings = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8, padding: '0 8px' }}>
      {mode === 'pva' && (<>
        <span style={{ color: '#f5d77e', fontSize: 12 }}>내 돌:
          {[BLACK, WHITE].map(col => <BtnSm key={col} active={playerColor === col} onClick={() => { setPlayerColor(col); resetGame(); setMode('pva'); }}>{col === BLACK ? '⚫흑' : '⚪백'}</BtnSm>)}
        </span>
        <span style={{ color: '#f5d77e', fontSize: 12 }}>난이도:
          {[0,1,2].map(d => <BtnSm key={d} active={aiDiff === d} onClick={() => setAiDiff(d)}>{diffLabel(d)}</BtnSm>)}
        </span>
      </>)}
      {mode === 'ava' && (<>
        <span style={{ color: '#f5d77e', fontSize: 12 }}>흑AI:
          {[0,1,2].map(d => <BtnSm key={d} active={aiDiff === d} onClick={() => setAiDiff(d)}>{diffLabel(d)}</BtnSm>)}
        </span>
        <span style={{ color: '#f5d77e', fontSize: 12 }}>백AI:
          {[0,1,2].map(d => <BtnSm key={d} active={aiDiff2 === d} onClick={() => setAiDiff2(d)}>{diffLabel(d)}</BtnSm>)}
        </span>
        <span style={{ color: '#f5d77e', fontSize: 12 }}>속도:
          {[[800,'느림'],[500,'보통'],[200,'빠름']].map(([v,l]) => <BtnSm key={v} active={avaSpeed === v} onClick={() => setAvaSpeed(v)}>{l}</BtnSm>)}
        </span>
      </>)}
    </div>
  );

  const turnBg = turn === BLACK ? '#f5d77e' : '#555';
  const turnColor = turn === BLACK ? '#111' : '#fff';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a0a00,#3d1f00,#1a0a00)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, paddingBottom: 16, fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      {/* 상단 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, width: '100%', maxWidth: boardPx, padding: '0 8px', boxSizing: 'border-box' }}>
        <button onClick={() => { resetGame(); setMode(null); }}
          style={{ background: 'none', border: '1px solid #c8a96e', color: '#c8a96e', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>← 메뉴</button>
        <h2 style={{ color: '#f5d77e', margin: 0, fontSize: 'clamp(14px,4vw,20px)', fontWeight: 800, flex: 1, textAlign: 'center' }}>
          {mode === 'pvp' ? '2인 대전' : mode === 'pva' ? 'AI 대전' : 'AI vs AI'}
        </h2>
        <span style={{ color: '#c8a96e', fontSize: 12, whiteSpace: 'nowrap' }}>{moveCount}수</span>
      </div>

      {renderSettings()}

      {/* 상태 표시 */}
      <div style={{ marginBottom: 8, height: 32, display: 'flex', alignItems: 'center' }}>
        {winner ? (
          <div style={{ background: 'linear-gradient(90deg,#f5d77e,#e8b84b)', color: '#1a0a00', borderRadius: 20, padding: '5px 20px', fontWeight: 800, fontSize: 15 }}>
            {winner === BLACK ? '⚫ 흑' : '⚪ 백'} 승리! 🎉
          </div>
        ) : (
          <div style={{ background: turnBg, color: turnColor, borderRadius: 20, padding: '5px 16px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            {turn === BLACK ? '⚫ 흑' : '⚪ 백'} 차례
            {mode === 'pva' && turn !== playerColor && <span style={{ fontSize: 11, opacity: 0.8 }}>AI 생각 중...</span>}
          </div>
        )}
      </div>

      {/* 보드 */}
      <div style={{ position: 'relative', width: boardPx, height: boardPx, background: 'linear-gradient(135deg,#c8913a,#a0702a,#8B5E1A)', borderRadius: 8, boxShadow: '0 6px 24px #0009', border: '3px solid #6b3e00', flexShrink: 0, touchAction: 'none' }}
        onMouseLeave={() => setHoveredCell(null)}>
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {Array.from({ length: SIZE }, (_, i) => (
            <g key={i}>
              <line x1={PAD} y1={PAD + i * CELL} x2={PAD + (SIZE-1)*CELL} y2={PAD + i*CELL} stroke="#5a3000" strokeWidth="0.7"/>
              <line x1={PAD + i*CELL} y1={PAD} x2={PAD + i*CELL} y2={PAD + (SIZE-1)*CELL} stroke="#5a3000" strokeWidth="0.7"/>
            </g>
          ))}
          {[[3,3],[3,11],[7,7],[11,3],[11,11],[3,7],[7,3],[7,11],[11,7]].map(([r,c]) => (
            <circle key={r+'-'+c} cx={PAD+c*CELL} cy={PAD+r*CELL} r={Math.max(2.5, CELL*0.09)} fill="#5a3000"/>
          ))}
        </svg>

        {Array.from({ length: SIZE }, (_, r) =>
          Array.from({ length: SIZE }, (_, c) => {
            const stone = board[r][c];
            const forbidden = stone === EMPTY && turn === BLACK && isForbiddenCell(r, c) && !winner;
            const win = isWinCell(r, c);
            const last = isLastMove(r, c);
            const hovered = hoveredCell && hoveredCell[0] === r && hoveredCell[1] === c;
            const canPlace = stone === EMPTY && !forbidden && !winner;
            const x = PAD + c * CELL, y = PAD + r * CELL;

            return (
              <div key={r+'-'+c}
                style={{ position: 'absolute', left: x-R, top: y-R, width: R*2, height: R*2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: stone ? 2 : 1 }}
                onClick={() => handleClick(r, c)}
                onMouseEnter={() => setHoveredCell([r, c])}>
                {stone === BLACK && (
                  <div style={{ width: R*2, height: R*2, borderRadius: '50%', background: win ? 'radial-gradient(circle at 35% 30%,#888,#111 60%)' : 'radial-gradient(circle at 35% 30%,#666,#111 60%)', border: win ? '2px solid #f5d77e' : '1.5px solid #222', boxShadow: win ? '0 0 10px #f5d77eaa' : '0 2px 5px #0008', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {last && <div style={{ width: R*0.38, height: R*0.38, borderRadius: '50%', background: '#e74' }}/>}
                  </div>
                )}
                {stone === WHITE && (
                  <div style={{ width: R*2, height: R*2, borderRadius: '50%', background: win ? 'radial-gradient(circle at 35% 30%,#fff,#ccc 60%)' : 'radial-gradient(circle at 35% 30%,#fff,#bbb 60%)', border: win ? '2px solid #f5d77e' : '1.5px solid #999', boxShadow: win ? '0 0 10px #f5d77eaa' : '0 2px 5px #0005', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {last && <div style={{ width: R*0.38, height: R*0.38, borderRadius: '50%', background: '#e74' }}/>}
                  </div>
                )}
                {forbidden && (
                  <span style={{ color: '#e74c3c', fontSize: R*1.1, lineHeight: 1, fontWeight: 900, opacity: 0.75 }}>✕</span>
                )}
                {!stone && !forbidden && canPlace && hovered && (
                  <div style={{ width: R*2, height: R*2, borderRadius: '50%', background: turn === BLACK ? 'radial-gradient(circle at 35% 30%,#666,#111)' : 'radial-gradient(circle at 35% 30%,#fff,#bbb)', opacity: 0.4, border: '1px solid #aaa' }}/>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {mode === 'ava' && !winner && (
          <button onClick={() => setAvaRunning(r => !r)}
            style={{ background: avaRunning ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {avaRunning ? '⏸ 일시정지' : '▶ 시작'}
          </button>
        )}
        {(mode === 'pvp' || mode === 'pva') && !winner && history.length > 0 && (
          <button onClick={handleUndo}
            style={{ background: '#555', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            ↩ 무르기
          </button>
        )}
        <button onClick={resetGame}
          style={{ background: 'linear-gradient(135deg,#8B4513,#D2691E)', color: '#fff', border: '2px solid #f5d77e', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          🔄 새 게임
        </button>
      </div>

      <div style={{ marginTop: 10, color: '#c8a96e77', fontSize: 10, textAlign: 'center' }}>
        렌주룰 · 흑: 3-3 / 4-4 / 장목 금수(✕) · 백: 제한 없음
      </div>
    </div>
  );
}