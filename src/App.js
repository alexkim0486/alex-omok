import { useState, useEffect, useCallback, useRef } from "react";

const SIZE = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;

// ─── 유틸 ───────────────────────────────────────────────
const newBoard = () => Array(SIZE).fill(null).map(() => Array(SIZE).fill(EMPTY));
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

function countDir(board, r, c, dr, dc, color) {
  let cnt = 0;
  let nr = r + dr, nc = c + dc;
  while (inBounds(nr, nc) && board[nr][nc] === color) { cnt++; nr += dr; nc += dc; }
  return cnt;
}

function lineInfo(board, r, c, dr, dc, color) {
  // returns {count, openA, openB} for one axis
  let cnt = 1;
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

// 5목 체크 (정확히 5 or 백은 5이상)
function checkWin(board, r, c, color) {
  for (const [dr, dc] of DIRS) {
    const { count } = lineInfo(board, r, c, dr, dc, color);
    if (color === WHITE && count >= 5) return true;
    if (color === BLACK && count === 5) return true;
  }
  return false;
}

// 승리 돌 위치 반환
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

// ─── 렌주룰 금수 판정 ────────────────────────────────────
function isOverline(board, r, c) {
  // 6목 이상
  for (const [dr, dc] of DIRS) {
    const { count } = lineInfo(board, r, c, dr, dc, BLACK);
    if (count >= 6) return true;
  }
  return false;
}

// 열린 3 체크: 정확히 3개 연속이고 양쪽 또는 한쪽이 열려서 4로 만들 수 있는 형태
function isOpenThree(board, r, c, dr, dc) {
  // 가상으로 놓은 후 체크
  const tmp = board.map(row => [...row]);
  tmp[r][c] = BLACK;

  // 해당 방향으로 연속 흑 수와 open 여부
  const { count, openF, openB } = lineInfo(tmp, r, c, dr, dc, BLACK);
  if (count !== 3) return false;
  // 양쪽 다 열려 있어야 진짜 열린 3
  return openF && openB;
}

function countOpenThrees(board, r, c) {
  const tmp = board.map(row => [...row]);
  tmp[r][c] = BLACK;
  let cnt = 0;
  for (const [dr, dc] of DIRS) {
    if (isOpenThreeOnBoard(tmp, r, c, dr, dc)) cnt++;
  }
  return cnt;
}

function isOpenThreeOnBoard(board, r, c, dr, dc) {
  const { count, openF, openB } = lineInfo(board, r, c, dr, dc, BLACK);
  if (count !== 3) return false;
  return openF && openB;
}

function countFours(board, r, c) {
  const tmp = board.map(row => [...row]);
  tmp[r][c] = BLACK;
  let cnt = 0;
  for (const [dr, dc] of DIRS) {
    const { count, openF, openB } = lineInfo(tmp, r, c, dr, dc, BLACK);
    if (count === 4 && (openF || openB)) cnt++;
    // 막힌 4도 44 카운트에 포함 (공식 렌주룰: 4는 열린/닫힌 무관)
    if (count === 4) cnt++;
  }
  // 중복 방지: 실제로는 방향당 1개
  // 다시 정확하게
  cnt = 0;
  for (const [dr, dc] of DIRS) {
    const { count } = lineInfo(tmp, r, c, dr, dc, BLACK);
    if (count === 4) cnt++;
  }
  return cnt;
}

function isForbidden(board, r, c) {
  if (board[r][c] !== EMPTY) return false;
  // 장목
  if (isOverline(board, r, c)) return true;
  // 44
  if (countFours(board, r, c) >= 2) return true;
  // 33
  if (countOpenThrees(board, r, c) >= 2) return true;
  return false;
}

function getForbiddenType(board, r, c) {
  if (board[r][c] !== EMPTY) return null;
  if (isOverline(board, r, c)) return "장목";
  if (countFours(board, r, c) >= 2) return "44";
  if (countOpenThrees(board, r, c) >= 2) return "33";
  return null;
}

// ─── AI ─────────────────────────────────────────────────
const SCORE = {
  five: 100000,
  openFour: 10000,
  four: 1000,
  openThree: 500,
  three: 100,
  openTwo: 50,
  two: 10,
};

function evalLine(count, openF, openB) {
  const opens = (openF ? 1 : 0) + (openB ? 1 : 0);
  if (count >= 5) return SCORE.five;
  if (count === 4) return opens === 2 ? SCORE.openFour : SCORE.four;
  if (count === 3) return opens === 2 ? SCORE.openThree : SCORE.three;
  if (count === 2) return opens === 2 ? SCORE.openTwo : SCORE.two;
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

function aiMove(board, color, difficulty) {
  const opp = color === BLACK ? WHITE : BLACK;
  const cands = getCandidates(board);

  if (difficulty === 0) {
    // 초보: 랜덤 + 기본 위협 차단
    let best = null, bestScore = -Infinity;
    for (const [r, c] of cands) {
      if (color === BLACK && isForbidden(board, r, c)) continue;
      const s = Math.random() * 50 + scorePosition(board, r, c, color) * 0.3 + scorePosition(board, r, c, opp) * 0.2;
      if (s > bestScore) { bestScore = s; best = [r, c]; }
    }
    return best || cands[0];
  }

  if (difficulty === 1) {
    // 중수: 탐욕 휴리스틱
    let best = null, bestScore = -Infinity;
    for (const [r, c] of cands) {
      if (color === BLACK && isForbidden(board, r, c)) continue;
      const myScore = scorePosition(board, r, c, color);
      const oppScore = scorePosition(board, r, c, opp);
      const s = myScore * 1.2 + oppScore;
      if (s > bestScore) { bestScore = s; best = [r, c]; }
    }
    return best || cands[0];
  }

  // 고수: 미니맥스 depth=2
  function minimax(b, depth, isMax, alpha, beta, aiColor) {
    const moves = getCandidates(b);
    if (depth === 0 || moves.length === 0) {
      let total = 0;
      for (const [r2, c2] of moves) {
        total += scorePosition(b, r2, c2, aiColor);
        total -= scorePosition(b, r2, c2, aiColor === BLACK ? WHITE : BLACK);
      }
      return total;
    }
    if (isMax) {
      let val = -Infinity;
      for (const [r2, c2] of moves.slice(0, 15)) {
        if (aiColor === BLACK && isForbidden(b, r2, c2)) continue;
        b[r2][c2] = aiColor;
        val = Math.max(val, minimax(b, depth - 1, false, alpha, beta, aiColor));
        b[r2][c2] = EMPTY;
        alpha = Math.max(alpha, val);
        if (beta <= alpha) break;
      }
      return val;
    } else {
      const oppC = aiColor === BLACK ? WHITE : BLACK;
      let val = Infinity;
      for (const [r2, c2] of moves.slice(0, 15)) {
        b[r2][c2] = oppC;
        val = Math.min(val, minimax(b, depth - 1, true, alpha, beta, aiColor));
        b[r2][c2] = EMPTY;
        beta = Math.min(beta, val);
        if (beta <= alpha) break;
      }
      return val;
    }
  }

  // 즉시 승리/차단 먼저
  for (const [r, c] of cands) {
    if (color === BLACK && isForbidden(board, r, c)) continue;
    const tmp = board.map(row => [...row]);
    tmp[r][c] = color;
    if (checkWin(tmp, r, c, color)) return [r, c];
  }
  for (const [r, c] of cands) {
    if (color === BLACK && isForbidden(board, r, c)) continue;
    const tmp = board.map(row => [...row]);
    tmp[r][c] = opp;
    if (checkWin(tmp, r, c, opp)) return [r, c];
  }

  let best = null, bestScore = -Infinity;
  const topCands = cands
    .filter(([r, c]) => !(color === BLACK && isForbidden(board, r, c)))
    .map(([r, c]) => {
      const s = scorePosition(board, r, c, color) * 1.2 + scorePosition(board, r, c, opp);
      return { r, c, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, 12);

  for (const { r, c } of topCands) {
    const tmp = board.map(row => [...row]);
    tmp[r][c] = color;
    const s = minimax(tmp, 2, false, -Infinity, Infinity, color);
    if (s > bestScore) { bestScore = s; best = [r, c]; }
  }
  return best || topCands[0] || cands[0];
}

// ─── 컴포넌트 ────────────────────────────────────────────
const CELL = 36;
const PAD = 24;
const BOARD_PX = PAD * 2 + CELL * (SIZE - 1);

export default function App() {
  const [board, setBoard] = useState(newBoard());
  const [turn, setTurn] = useState(BLACK);
  const [winner, setWinner] = useState(null);
  const [winCells, setWinCells] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState(null); // null=메뉴, 'pvp','pva','ava'
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

  // 금수 셀 계산
  useEffect(() => {
    if (winner) { setForbiddenCells([]); return; }
    if (turn !== BLACK) { setForbiddenCells([]); return; }
    const fc = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (board[r][c] === EMPTY && isForbidden(board, r, c))
          fc.push([r, c]);
    setForbiddenCells(fc);
  }, [board, turn, winner]);

  const place = useCallback((b, r, c, color) => {
    if (b[r][c] !== EMPTY) return null;
    if (color === BLACK && isForbidden(b, r, c)) return null;
    const nb = b.map(row => [...row]);
    nb[r][c] = color;
    return nb;
  }, []);

  const afterPlace = useCallback((nb, r, c, color, prevHistory) => {
    const won = checkWin(nb, r, c, color);
    const wc = won ? getWinCells(nb, r, c, color) : [];
    return { nb, won, wc };
  }, []);

  const handleClick = useCallback((r, c) => {
    if (winner || mode === 'ava') return;
    if (mode === 'pva' && turn !== playerColor) return;
    const nb = place(board, r, c, turn);
    if (!nb) return;
    const { won, wc } = afterPlace(nb, r, c, turn, history);
    const newHistory = [...history, { board: board.map(row => [...row]), turn, lastMove }];
    setHistory(newHistory);
    setBoard(nb);
    setLastMove([r, c]);
    setMoveCount(p => p + 1);
    if (won) { setWinner(turn); setWinCells(wc); return; }
    setTurn(t => t === BLACK ? WHITE : BLACK);
  }, [board, turn, winner, mode, playerColor, place, afterPlace, history, lastMove]);

  // AI 착수 (PvA)
  useEffect(() => {
    if (mode !== 'pva' || winner) return;
    if (turn === playerColor) return;
    const aiColor = turn;
    const diff = aiDiff;
    const timer = setTimeout(() => {
      const b = boardRef.current;
      const mv = aiMove(b, aiColor, diff);
      if (!mv) return;
      const [r, c] = mv;
      const nb = b.map(row => [...row]);
      nb[r][c] = aiColor;
      const { won, wc } = afterPlace(nb, r, c, aiColor, []);
      setBoard(nb);
      setLastMove([r, c]);
      setMoveCount(p => p + 1);
      if (won) { setWinner(aiColor); setWinCells(wc); return; }
      setTurn(t => t === BLACK ? WHITE : BLACK);
    }, 300);
    return () => clearTimeout(timer);
  }, [turn, mode, playerColor, winner, aiDiff, afterPlace]);

  // AI vs AI
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
      const nb = b.map(row => [...row]);
      nb[r][c] = color;
      const { won, wc } = afterPlace(nb, r, c, color, []);
      setBoard(nb);
      setLastMove([r, c]);
      setMoveCount(p => p + 1);
      if (won) { setWinner(color); setWinCells(wc); setAvaRunning(false); return; }
      setTurn(t => t === BLACK ? WHITE : BLACK);
    }, avaSpeed);
    return () => { clearTimeout(timer); };
  }, [turn, mode, avaRunning, winner, aiDiff, aiDiff2, avaSpeed, afterPlace]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setBoard(last.board);
    setTurn(last.turn);
    setLastMove(last.lastMove);
    setHistory(h => h.slice(0, -1));
    setWinner(null);
    setWinCells([]);
    setMoveCount(p => Math.max(0, p - 1));
  };

  const resetGame = () => {
    avaRef.current = false;
    setBoard(newBoard());
    setTurn(BLACK);
    setWinner(null);
    setWinCells([]);
    setLastMove(null);
    setHistory([]);
    setMoveCount(0);
    setAvaRunning(false);
    setForbiddenCells([]);
  };

  const startMode = (m) => {
    resetGame();
    setMode(m);
    if (m === 'ava') setAvaRunning(false);
  };

  const isForbiddenCell = (r, c) => forbiddenCells.some(([fr, fc]) => fr === r && fc === c);
  const isWinCell = (r, c) => winCells.some(([wr, wc]) => wr === r && wc === c);
  const isLastMove = (r, c) => lastMove && lastMove[0] === r && lastMove[1] === c;

  const diffLabel = d => ['초보', '중수', '고수'][d];

  // ─── 메뉴 화면 ───
  if (!mode) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a0a00 0%, #3d1f00 50%, #1a0a00 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>⚫⚪</div>
        <h1 style={{ color: '#f5d77e', fontSize: 36, fontWeight: 900, margin: 0, textShadow: '0 2px 8px #000' }}>알렉스의 오목</h1>
        <p style={{ color: '#c8a96e', fontSize: 14, marginTop: 8 }}>공식 렌주룰 적용</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 260 }}>
        {[['pvp', '👥 2인 대전', '두 명이 함께 플레이'],
          ['pva', '🤖 AI 대전', 'AI와 대결'],
          ['ava', '🎬 AI vs AI', 'AI 대국 관람']
        ].map(([m, label, sub]) => (
          <button key={m} onClick={() => startMode(m)}
            style={{ background: 'linear-gradient(135deg, #8B4513, #D2691E)', color: '#fff', border: '2px solid #f5d77e', borderRadius: 14, padding: '16px 24px', fontSize: 18, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px #0008', transition: 'transform 0.1s' }}
            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.04)'}
            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            {label}
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>{sub}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── 게임 설정 패널 ───
  const renderSettings = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
      {mode === 'pva' && (
        <>
          <div style={{ color: '#f5d77e', fontSize: 13 }}>내 돌:
            {[BLACK, WHITE].map(col => (
              <button key={col} onClick={() => { setPlayerColor(col); resetGame(); setMode('pva'); }}
                style={{ marginLeft: 6, padding: '3px 10px', borderRadius: 8, border: playerColor === col ? '2px solid #f5d77e' : '2px solid #555', background: playerColor === col ? '#8B4513' : '#333', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                {col === BLACK ? '⚫흑' : '⚪백'}
              </button>
            ))}
          </div>
          <div style={{ color: '#f5d77e', fontSize: 13 }}>난이도:
            {[0, 1, 2].map(d => (
              <button key={d} onClick={() => setAiDiff(d)}
                style={{ marginLeft: 6, padding: '3px 10px', borderRadius: 8, border: aiDiff === d ? '2px solid #f5d77e' : '2px solid #555', background: aiDiff === d ? '#8B4513' : '#333', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                {diffLabel(d)}
              </button>
            ))}
          </div>
        </>
      )}
      {mode === 'ava' && (
        <>
          <div style={{ color: '#f5d77e', fontSize: 13 }}>흑 AI:
            {[0, 1, 2].map(d => (
              <button key={d} onClick={() => setAiDiff(d)}
                style={{ marginLeft: 6, padding: '3px 10px', borderRadius: 8, border: aiDiff === d ? '2px solid #f5d77e' : '2px solid #555', background: aiDiff === d ? '#8B4513' : '#333', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                {diffLabel(d)}
              </button>
            ))}
          </div>
          <div style={{ color: '#f5d77e', fontSize: 13 }}>백 AI:
            {[0, 1, 2].map(d => (
              <button key={d} onClick={() => setAiDiff2(d)}
                style={{ marginLeft: 6, padding: '3px 10px', borderRadius: 8, border: aiDiff2 === d ? '2px solid #f5d77e' : '2px solid #555', background: aiDiff2 === d ? '#8B4513' : '#333', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                {diffLabel(d)}
              </button>
            ))}
          </div>
          <div style={{ color: '#f5d77e', fontSize: 13 }}>속도:
            {[[800,'느림'],[500,'보통'],[200,'빠름']].map(([v, l]) => (
              <button key={v} onClick={() => setAvaSpeed(v)}
                style={{ marginLeft: 6, padding: '3px 10px', borderRadius: 8, border: avaSpeed === v ? '2px solid #f5d77e' : '2px solid #555', background: avaSpeed === v ? '#8B4513' : '#333', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                {l}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const turnColor = turn === BLACK ? '#111' : '#fff';
  const turnBg = turn === BLACK ? '#f5d77e' : '#555';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a0a00 0%, #3d1f00 50%, #1a0a00 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16, paddingBottom: 24, fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 상단 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
        <button onClick={() => { resetGame(); setMode(null); }}
          style={{ background: 'none', border: '1px solid #c8a96e', color: '#c8a96e', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>← 메뉴</button>
        <h2 style={{ color: '#f5d77e', margin: 0, fontSize: 20, fontWeight: 800 }}>
          {mode === 'pvp' ? '2인 대전' : mode === 'pva' ? 'AI 대전' : 'AI vs AI'}
        </h2>
        <span style={{ color: '#c8a96e', fontSize: 13 }}>{moveCount}수</span>
      </div>

      {renderSettings()}

      {/* 상태 표시 */}
      <div style={{ marginBottom: 10, height: 36, display: 'flex', alignItems: 'center', gap: 10 }}>
        {winner ? (
          <div style={{ background: 'linear-gradient(90deg, #f5d77e, #e8b84b)', color: '#1a0a00', borderRadius: 20, padding: '6px 24px', fontWeight: 800, fontSize: 16 }}>
            {winner === BLACK ? '⚫ 흑' : '⚪ 백'} 승리! 🎉
          </div>
        ) : (
          <div style={{ background: turnBg, color: turnColor, borderRadius: 20, padding: '6px 20px', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            {turn === BLACK ? '⚫ 흑' : '⚪ 백'} 차례
            {mode === 'pva' && turn !== playerColor && <span style={{ fontSize: 12, opacity: 0.8 }}>AI 생각 중...</span>}
            {mode === 'ava' && <span style={{ fontSize: 12, opacity: 0.8 }}>AI</span>}
          </div>
        )}
      </div>

      {/* 보드 */}
      <div style={{ position: 'relative', width: BOARD_PX, height: BOARD_PX, background: 'linear-gradient(135deg, #c8913a 0%, #a0702a 40%, #8B5E1A 100%)', borderRadius: 8, boxShadow: '0 8px 32px #0009, inset 0 1px 0 #e8c87088', border: '3px solid #6b3e00', cursor: winner ? 'default' : 'pointer' }}
        onMouseLeave={() => setHoveredCell(null)}>

        {/* 격자 선 */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {Array.from({ length: SIZE }, (_, i) => (
            <g key={i}>
              <line x1={PAD} y1={PAD + i * CELL} x2={PAD + (SIZE - 1) * CELL} y2={PAD + i * CELL} stroke="#5a3000" strokeWidth="0.8" />
              <line x1={PAD + i * CELL} y1={PAD} x2={PAD + i * CELL} y2={PAD + (SIZE - 1) * CELL} stroke="#5a3000" strokeWidth="0.8" />
            </g>
          ))}
          {/* 화점 */}
          {[[3,3],[3,11],[7,7],[11,3],[11,11],[3,7],[7,3],[7,11],[11,7]].map(([r,c]) => (
            <circle key={`${r}${c}`} cx={PAD + c * CELL} cy={PAD + r * CELL} r={3.5} fill="#5a3000" />
          ))}
        </svg>

        {/* 돌 및 인터랙션 */}
        {Array.from({ length: SIZE }, (_, r) =>
          Array.from({ length: SIZE }, (_, c) => {
            const stone = board[r][c];
            const forbidden = stone === EMPTY && turn === BLACK && isForbiddenCell(r, c) && !winner;
            const win = isWinCell(r, c);
            const last = isLastMove(r, c);
            const hovered = hoveredCell && hoveredCell[0] === r && hoveredCell[1] === c;
            const canPlace = stone === EMPTY && !forbidden && !winner;
            const x = PAD + c * CELL, y = PAD + r * CELL;
            const R = CELL * 0.46;

            return (
              <div key={`${r}-${c}`}
                style={{ position: 'absolute', left: x - R, top: y - R, width: R * 2, height: R * 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: stone !== EMPTY ? 2 : 1 }}
                onClick={() => handleClick(r, c)}
                onMouseEnter={() => setHoveredCell([r, c])}>
                {stone === BLACK && (
                  <div style={{ width: R * 2, height: R * 2, borderRadius: '50%', background: win ? 'radial-gradient(circle at 35% 30%, #888, #111 60%)' : 'radial-gradient(circle at 35% 30%, #666, #111 60%)', border: win ? '2px solid #f5d77e' : '1.5px solid #222', boxShadow: win ? '0 0 12px #f5d77eaa' : '0 2px 6px #0008', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {last && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e74' }} />}
                  </div>
                )}
                {stone === WHITE && (
                  <div style={{ width: R * 2, height: R * 2, borderRadius: '50%', background: win ? 'radial-gradient(circle at 35% 30%, #fff, #ccc 60%)' : 'radial-gradient(circle at 35% 30%, #fff, #bbb 60%)', border: win ? '2px solid #f5d77e' : '1.5px solid #999', boxShadow: win ? '0 0 12px #f5d77eaa' : '0 2px 6px #0005', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {last && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e74' }} />}
                  </div>
                )}
                {forbidden && (
                  <div style={{ width: R * 1.5, height: R * 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                    <span style={{ color: '#e74c3c', fontSize: R * 1.2, lineHeight: 1, fontWeight: 900 }}>✕</span>
                  </div>
                )}
                {!stone && !forbidden && canPlace && hovered && (
                  <div style={{ width: R * 2, height: R * 2, borderRadius: '50%', background: turn === BLACK ? 'radial-gradient(circle at 35% 30%, #666, #111)' : 'radial-gradient(circle at 35% 30%, #fff, #bbb)', opacity: 0.45, border: '1px solid #aaa' }} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {mode === 'ava' && !winner && (
          <button onClick={() => setAvaRunning(r => !r)}
            style={{ background: avaRunning ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #0006' }}>
            {avaRunning ? '⏸ 일시정지' : '▶ 시작'}
          </button>
        )}
        {(mode === 'pvp' || mode === 'pva') && !winner && history.length > 0 && (
          <button onClick={handleUndo}
            style={{ background: '#555', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            ↩ 무르기
          </button>
        )}
        <button onClick={resetGame}
          style={{ background: 'linear-gradient(135deg, #8B4513, #D2691E)', color: '#fff', border: '2px solid #f5d77e', borderRadius: 10, padding: '10px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #0006' }}>
          🔄 새 게임
        </button>
      </div>

      {/* 렌주룰 안내 */}
      <div style={{ marginTop: 14, color: '#c8a96e88', fontSize: 11, textAlign: 'center' }}>
        렌주룰 적용 · 흑: 3-3 / 4-4 / 장목 금수(✕) · 백: 제한 없음
      </div>
    </div>
  );
}