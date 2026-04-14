import { useState, useEffect, useCallback, useRef } from "react";

const SIZE = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const newBoard = () => Array(SIZE).fill(null).map(() => Array(SIZE).fill(EMPTY));
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

// ── 기본 유틸 ────────────────────────────────────────────
function lineInfo(board, r, c, dr, dc, color) {
  let nr = r+dr, nc = c+dc, cntF = 0;
  while (inBounds(nr,nc) && board[nr][nc]===color){cntF++;nr+=dr;nc+=dc;}
  const openF = inBounds(nr,nc) && board[nr][nc]===EMPTY;
  nr=r-dr; nc=c-dc; let cntB=0;
  while (inBounds(nr,nc) && board[nr][nc]===color){cntB++;nr-=dr;nc-=dc;}
  const openB = inBounds(nr,nc) && board[nr][nc]===EMPTY;
  return {count:1+cntF+cntB, openF, openB, cntF, cntB};
}

function checkWin(board, r, c, color) {
  for (const [dr,dc] of DIRS) {
    const {count} = lineInfo(board,r,c,dr,dc,color);
    if (color===WHITE && count>=5) return true;
    if (color===BLACK && count===5) return true;
  }
  return false;
}

function getWinCells(board, r, c, color) {
  for (const [dr,dc] of DIRS) {
    const cells = [[r,c]];
    let nr=r+dr, nc=c+dc;
    while(inBounds(nr,nc)&&board[nr][nc]===color){cells.push([nr,nc]);nr+=dr;nc+=dc;}
    nr=r-dr; nc=c-dc;
    while(inBounds(nr,nc)&&board[nr][nc]===color){cells.push([nr,nc]);nr-=dr;nc-=dc;}
    if (color===WHITE && cells.length>=5) return cells;
    if (color===BLACK && cells.length===5) return cells;
  }
  return [];
}

// ── 렌주룰 (나무위키 렌주 문서 기준 정확한 판정) ──────────

// 가상 보드에 돌 놓기
const withStone = (board, r, c, color) => {
  const tmp = board.map(row=>[...row]); tmp[r][c]=color; return tmp;
};

// 5목 완성 여부 (정확히 5목, 장목 아님)
function makesFive(board, r, c) {
  const tmp = withStone(board,r,c,BLACK);
  for(const [dr,dc] of DIRS){
    const {count} = lineInfo(tmp,r,c,dr,dc,BLACK);
    if(count===5) return true;
  }
  return false;
}

// 장목: 6목 이상
function isOverline(board, r, c) {
  const tmp = withStone(board,r,c,BLACK);
  for(const [dr,dc] of DIRS){
    const {count} = lineInfo(tmp,r,c,dr,dc,BLACK);
    if(count>=6) return true;
  }
  return false;
}

// ── 4목 판정 (띈 4 포함) ──────────────────────────────────
// 렌주룰에서 '4': 한 수를 더 두면 5목이 될 수 있는 모든 형태
// 연속4: ●●●●_ 또는 _●●●● (한쪽 막힌4, 열린4)
// 띈4:   ●●●_● 또는 ●●_●● 또는 ●_●●● 등
function countFoursInDir(board, r, c, dr, dc) {
  // r,c에 BLACK이 이미 놓인 상태에서 해당 방향의 4목 개수
  // 4목 = 이 방향으로 5칸 윈도우 내에서 4개의 흑돌 + 1개의 빈칸이 존재하고
  //       그 빈칸에 놓으면 5목이 되는 경우
  let cnt = 0;
  // 이 방향으로 -4 ~ 0 까지 5칸 윈도우를 슬라이딩
  for(let start=-4; start<=0; start++){
    const cells = [];
    for(let i=0; i<5; i++){
      const nr=r+(start+i)*dr, nc=c+(start+i)*dc;
      if(!inBounds(nr,nc)){cells.push('X');continue;}
      cells.push(board[nr][nc]);
    }
    // 윈도우 내 흑돌 4개 + 빈칸 1개 이면 4목 후보
    const blacks = cells.filter(v=>v===BLACK).length;
    const empties = cells.filter(v=>v===EMPTY).length;
    const walls = cells.filter(v=>v==='X'||v===WHITE).length;
    if(blacks===4 && empties===1 && walls===0) {
      // 빈칸 자리에 놓으면 실제로 5목이 되는지 확인
      for(let i=0;i<5;i++){
        if(cells[i]===EMPTY){
          const er=r+(start+i)*dr, ec=c+(start+i)*dc;
          if(inBounds(er,ec)){
            const tmp2=board.map(row=>[...row]); tmp2[er][ec]=BLACK;
            const {count}=lineInfo(tmp2,er,ec,dr,dc,BLACK);
            if(count===5){cnt++;break;}
          }
        }
      }
    }
  }
  return cnt>0?1:0; // 방향당 최대 1개
}

function countFours(board, r, c) {
  if(board[r][c]!==EMPTY) return 0;
  const tmp = withStone(board,r,c,BLACK);
  let cnt=0;
  for(const [dr,dc] of DIRS) cnt+=countFoursInDir(tmp,r,c,dr,dc);
  return cnt;
}

// ── 3목 판정 (띈 3 포함, 거짓금수 제외) ──────────────────
// 렌주룰에서 '열린3': 한 수를 더 두면 열린4(양쪽 열린 4목)가 될 수 있는 형태
// 연속3: _●●●_ (양쪽 열린)
// 띈3:   _●●_●_ 또는 _●_●●_ 등 (양쪽 열린 + 한칸 띔)
// 거짓금수: 3처럼 보여도 그 다음 수에서 열린4를 만들 수 없으면 3이 아님
function isOpenThreeInDir(board, r, c, dr, dc) {
  // r,c에 BLACK이 이미 놓인 상태
  // 이 방향으로 6칸 윈도우 내에서 열린3 패턴 탐색
  for(let start=-5; start<=0; start++){
    const cells=[];
    const coords=[];
    for(let i=0;i<6;i++){
      const nr=r+(start+i)*dr, nc=c+(start+i)*dc;
      if(!inBounds(nr,nc)){cells.push('X');coords.push(null);continue;}
      cells.push(board[nr][nc]);coords.push([nr,nc]);
    }
    // 양 끝이 열려야 함 (빈칸 또는 범위 밖이면 안됨 - 양쪽 모두 빈칸이어야)
    if(cells[0]!==EMPTY || cells[5]!==EMPTY) continue;
    // 중간 4칸(인덱스 1~4)에서 흑돌 3개 + 빈칸 1개 패턴
    const mid = cells.slice(1,5);
    const blacks = mid.filter(v=>v===BLACK).length;
    const empties = mid.filter(v=>v===EMPTY).length;
    if(blacks!==3 || empties!==1) continue;
    // 거짓금수 체크: 빈칸에 놓았을 때 열린4가 만들어지는지 확인
    for(let i=1;i<=4;i++){
      if(cells[i]===EMPTY && coords[i]){
        const [er,ec]=coords[i];
        const tmp2=board.map(row=>[...row]); tmp2[er][ec]=BLACK;
        // 이 자리에 놓으면 4목이 되고 양쪽이 열린지 확인
        const {count,openF,openB}=lineInfo(tmp2,er,ec,dr,dc,BLACK);
        if(count===4 && openF && openB) return true;
        // 기준점 r,c 에서도 확인
        const {count:c2,openF:of2,openB:ob2}=lineInfo(tmp2,r,c,dr,dc,BLACK);
        if(c2===4 && of2 && ob2) return true;
      }
    }
  }
  return false;
}

function countOpenThrees(board, r, c) {
  if(board[r][c]!==EMPTY) return 0;
  const tmp = withStone(board,r,c,BLACK);
  let cnt=0;
  for(const [dr,dc] of DIRS) if(isOpenThreeInDir(tmp,r,c,dr,dc)) cnt++;
  return cnt;
}

// ── 금수 최종 판정 ────────────────────────────────────────
function isForbidden(board, r, c) {
  if(board[r][c]!==EMPTY) return false;
  // 5목 완성은 금수보다 항상 우선 → 승리
  if(makesFive(board,r,c)) return false;
  // 장목 (6목 이상)
  if(isOverline(board,r,c)) return true;
  // 4-4 (쌍사, 띈4 포함, 열림/닫힘 무관)
  if(countFours(board,r,c)>=2) return true;
  // 3-3 (쌍삼, 열린3만 해당, 띈3 포함, 거짓금수 제외)
  if(countOpenThrees(board,r,c)>=2) return true;
  return false;
}


// AI 로직은 aiWorker.js로 분리됨

// ── 반응형 ───────────────────────────────────────────────
function useBoardSize(){
  const calc=()=>Math.max(280,Math.min(window.innerWidth*0.97,window.innerHeight*0.55,520));
  const[size,setSize]=useState(calc);
  useEffect(()=>{
    const fn=()=>setSize(calc());
    window.addEventListener('resize',fn);
    return()=>window.removeEventListener('resize',fn);
  },[]);
  return size;
}

// ── 효과음 ───────────────────────────────────────────────
let sharedAudioCtx = null;
function getAudioContext() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
  return sharedAudioCtx;
}

function playStone(color) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = color === BLACK ? 180 : 360;
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

function playWin() {
  try {
    const ctx = getAudioContext();
    [523,659,784,1047].forEach((f,i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = f;
      g.gain.setValueAtTime(0.3, ctx.currentTime+i*0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+i*0.18+0.4);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime+i*0.18);
      osc.stop(ctx.currentTime+i*0.18+0.4);
    });
  } catch(e) {}
}

// ── 타이머 색상 ──────────────────────────────────────────
const timerColor=t=>t>20?'#4CAF50':t>10?'#FFC107':'#e74c3c';

const LEVEL_NAMES=['','초보','중수','고수'];
const LEVEL_COLORS=['','#88cc44','#4488ff','#ff4400'];
const LEVEL_BG=['','#2a3a1a','#1a2050','#2a0000'];

// ── 메인 컴포넌트 ─────────────────────────────────────────
export default function App() {
  const boardPx=useBoardSize();
  const PAD=boardPx*0.045;
  const CELL=(boardPx-PAD*2)/(SIZE-1);
  const R=CELL*0.46;

  const[board,setBoard]=useState(newBoard());
  const[turn,setTurn]=useState(BLACK);
  const[winner,setWinner]=useState(null);
  const[winCells,setWinCells]=useState([]);
  const[lastMove,setLastMove]=useState(null);
  const[history,setHistory]=useState([]);
  const[mode,setMode]=useState(null);
  const[playerColor,setPlayerColor]=useState(BLACK);
  const[aiLevel,setAiLevel]=useState(2);
  const[aiLevel2,setAiLevel2]=useState(2);
  const[avaSpeed,setAvaSpeed]=useState(600);
  const[avaRunning,setAvaRunning]=useState(false);
  const[forbiddenCells,setForbiddenCells]=useState([]);
  const[moveCount,setMoveCount]=useState(0);
  const[timeLimit,setTimeLimit]=useState(0);
  const[timeLeft,setTimeLeft]=useState(0);
  const[pending,setPending]=useState(null); // 착수 대기
  const workerRef=useRef(null);
  const aiActiveRef=useRef(false);
  const boardRef=useRef(board);
  const turnRef=useRef(turn);
  const modeRef=useRef(mode);

  boardRef.current=board;
  turnRef.current=turn;
  modeRef.current=mode;

  // Worker 초기화
  useEffect(()=>{
    const w = new Worker(new URL('./aiWorker.js', import.meta.url));
    workerRef.current = w;
    w.onmessage=(e)=>{
      if(!aiActiveRef.current) return;
      aiActiveRef.current=false;
      const move=e.data;
      if(!move) return;
      const[r,c]=move;
      const b=boardRef.current;
      const color=turnRef.current;
      const nb=b.map(row=>[...row]); nb[r][c]=color;
      const won=checkWin(nb,r,c,color);
      const wc=won?getWinCells(nb,r,c,color):[];
      playStone(color);
      setBoard(nb); setLastMove([r,c]); setMoveCount(p=>p+1);
      if(won){
        setWinner(color); setWinCells(wc); playWin();
        if(modeRef.current==='ava') setAvaRunning(false);
        return;
      }
      setTurn(t=>t===BLACK?WHITE:BLACK);
    };
    return()=>{ w.terminate(); aiActiveRef.current=false; };
  },[]);

  // 금수 계산
  useEffect(()=>{
    if(winner||turn!==BLACK){setForbiddenCells([]);return;}
    const fc=[];
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++)
      if(board[r][c]===EMPTY&&isForbidden(board,r,c)) fc.push([r,c]);
    setForbiddenCells(fc);
  },[board,turn,winner]);

  // 타이머 리셋
  useEffect(()=>{if(timeLimit&&!winner&&mode!=='ava')setTimeLeft(timeLimit);},[turn,timeLimit,winner,mode]);
  useEffect(()=>{
    if(!timeLimit||winner||mode==='ava'||timeLeft<=0)return;
    const id=setTimeout(()=>setTimeLeft(t=>t-1),1000);
    return()=>clearTimeout(id);
  },[timeLeft,timeLimit,winner,mode]);
  useEffect(()=>{
    if(timeLimit&&!winner&&mode!=='ava'&&timeLeft===0&&timeLimit>0)
      setTurn(t=>t===BLACK?WHITE:BLACK);
  },[timeLeft,timeLimit,winner,mode]);

  const place=useCallback((b,r,c,color)=>{
    if(b[r][c]!==EMPTY)return null;
    if(color===BLACK&&isForbidden(b,r,c))return null;
    const nb=b.map(row=>[...row]);nb[r][c]=color;return nb;
  },[]);

  const afterPlace=useCallback((nb,r,c,color)=>{
    const won=checkWin(nb,r,c,color);
    return{won,wc:won?getWinCells(nb,r,c,color):[]};
  },[]);

  const commitMove=useCallback((r,c,color,b)=>{
    const nb=place(b||board,r,c,color);
    if(!nb)return;
    playStone(color);
    const{won,wc}=afterPlace(nb,r,c,color);
    setHistory(h=>[...h,{board:board.map(row=>[...row]),turn,lastMove}]);
    setBoard(nb);setLastMove([r,c]);setMoveCount(p=>p+1);setPending(null);
    if(won){setWinner(color);setWinCells(wc);playWin();return;}
    setTurn(t=>t===BLACK?WHITE:BLACK);
  },[board,turn,lastMove,place,afterPlace]);

  // 클릭: pending 방식
  const handleClick=useCallback((r,c)=>{
    if(winner||mode==='ava')return;
    if(mode==='pva'&&turn!==playerColor)return;
    if(board[r][c]!==EMPTY)return;
    if(turn===BLACK&&isForbidden(board,r,c))return;
    if(pending&&pending[0]===r&&pending[1]===c){
      commitMove(r,c,turn);
    } else {
      setPending([r,c]);
    }
  },[board,turn,winner,mode,playerColor,pending,commitMove]);

  const confirmMove=()=>{if(pending)commitMove(pending[0],pending[1],turn);};

  // PvA AI → Worker로 전송
  useEffect(()=>{
    if(mode!=='pva'||winner||turn===playerColor)return;
    setPending(null);
    aiActiveRef.current=true;
    const lv=aiLevel;
    const timer=setTimeout(()=>{
      if(!aiActiveRef.current) return;
      workerRef.current?.postMessage({board:boardRef.current, color:turnRef.current, level:lv});
    }, 300);
    return()=>{ clearTimeout(timer); aiActiveRef.current=false; };
  },[turn,mode,playerColor,winner,aiLevel]);

  // AvA → Worker로 전송
  useEffect(()=>{
    if(mode!=='ava'||!avaRunning||winner)return;
    aiActiveRef.current=true;
    const color=turnRef.current;
    const lv=color===BLACK?aiLevel:aiLevel2;
    const timer=setTimeout(()=>{
      if(!aiActiveRef.current) return;
      workerRef.current?.postMessage({board:boardRef.current, color, level:lv});
    }, avaSpeed);
    return()=>{ clearTimeout(timer); aiActiveRef.current=false; };
  },[turn,mode,avaRunning,winner,aiLevel,aiLevel2,avaSpeed]);

  const handleUndo=()=>{
    if(history.length===0)return;
    const last=history[history.length-1];
    setBoard(last.board);setTurn(last.turn);setLastMove(last.lastMove);
    setHistory(h=>h.slice(0,-1));setWinner(null);setWinCells([]);
    setMoveCount(p=>Math.max(0,p-1));setPending(null);
    if(timeLimit)setTimeLeft(timeLimit);
  };

  const resetGame=()=>{
    aiActiveRef.current=false;
    setBoard(newBoard());setTurn(BLACK);setWinner(null);setWinCells([]);
    setLastMove(null);setHistory([]);setMoveCount(0);
    setAvaRunning(false);setForbiddenCells([]);setPending(null);
    if(timeLimit)setTimeLeft(timeLimit);
  };

  const startMode=m=>{resetGame();setMode(m);};
  const isForbiddenCell=(r,c)=>forbiddenCells.some(([fr,fc])=>fr===r&&fc===c);
  const isWinCell=(r,c)=>winCells.some(([wr,wc])=>wr===r&&wc===c);
  const isLastMove=(r,c)=>lastMove&&lastMove[0]===r&&lastMove[1]===c;
  const isPending=(r,c)=>pending&&pending[0]===r&&pending[1]===c;

  // ── 메뉴 화면 ───────────────────────────────────────────
  if(!mode) return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at center,#2a1500 0%,#0d0800 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'serif',padding:16,position:'relative',overflow:'hidden'}}>
      {/* 바둑판 배경 패턴 */}
      <svg style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',opacity:0.07,pointerEvents:'none'}}>
        {Array.from({length:20},(_,i)=>(
          <g key={i}>
            <line x1={i*5+'%'} y1="0" x2={i*5+'%'} y2="100%" stroke="#c8a96e" strokeWidth="0.5"/>
            <line x1="0" y1={i*5+'%'} x2="100%" y2={i*5+'%'} stroke="#c8a96e" strokeWidth="0.5"/>
          </g>
        ))}
      </svg>
      {/* 장식 돌 */}
      {[[15,20],[85,15],[10,80],[90,75],[50,10],[20,50],[75,60]].map(([x,y],i)=>(
        <div key={i} style={{position:'absolute',left:x+'%',top:y+'%',width:i%2===0?24:18,height:i%2===0?24:18,borderRadius:'50%',background:i%2===0?'radial-gradient(circle at 35% 30%,#666,#111)':'radial-gradient(circle at 35% 30%,#fff,#ccc)',boxShadow:'0 2px 8px #0008',opacity:0.3}}/>
      ))}

      <div style={{textAlign:'center',marginBottom:24,position:'relative',zIndex:1}}>
        <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:12}}>
          {[1,0,1,0,1].map((b,i)=>(
            <div key={i} style={{width:20,height:20,borderRadius:'50%',background:b?'radial-gradient(circle at 35% 30%,#666,#111)':'radial-gradient(circle at 35% 30%,#fff,#ccc)',boxShadow:'0 2px 6px #0006'}}/>
          ))}
        </div>
        <h1 style={{color:'#f5d77e',fontSize:'clamp(18px,5vw,30px)',fontWeight:900,margin:'0 0 4px',textShadow:'0 0 20px #f5d77e44, 0 2px 8px #000',letterSpacing:1}}>싸샤와 스베따의 오목</h1>
        <p style={{color:'#c8a96e',fontSize:12,margin:'0 0 4px'}}>공식 렌주룰 적용</p>
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:8}}>
          {[0,1,0,1,0].map((b,i)=>(
            <div key={i} style={{width:14,height:14,borderRadius:'50%',background:b?'radial-gradient(circle at 35% 30%,#666,#111)':'radial-gradient(circle at 35% 30%,#fff,#ccc)',boxShadow:'0 1px 4px #0006'}}/>
          ))}
        </div>
      </div>

      {/* 제한시간 */}
      <div style={{marginBottom:16,textAlign:'center',position:'relative',zIndex:1}}>
        <div style={{color:'#c8a96e',fontSize:12,marginBottom:6}}>⏱ 제한시간 (수당)</div>
        <div style={{display:'flex',gap:6,justifyContent:'center',flexWrap:'wrap'}}>
          {[[0,'무제한'],[10,'10초'],[20,'20초'],[30,'30초']].map(([v,l])=>(
            <button key={v} onClick={()=>setTimeLimit(v)}
              style={{padding:'5px 12px',borderRadius:8,border:timeLimit===v?'2px solid #f5d77e':'2px solid #444',background:timeLimit===v?'#6b3e00':'#1a0a00',color:timeLimit===v?'#f5d77e':'#888',cursor:'pointer',fontSize:12,fontWeight:timeLimit===v?700:400}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* 모드 버튼 */}
      <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%',maxWidth:280,position:'relative',zIndex:1}}>
        {[['pvp','👥 2인 대전','두 명이 함께 플레이'],['pva','🤖 AI 대전','AI와 대결'],['ava','🎬 AI vs AI','AI 대국 관람']].map(([m,label,sub])=>(
          <button key={m} onClick={()=>startMode(m)}
            style={{background:'linear-gradient(135deg,#5c2a00,#a0500a)',color:'#f5d77e',border:'1px solid #f5d77e55',borderRadius:12,padding:'13px 20px',fontSize:15,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 16px #0008',letterSpacing:0.5}}>
            {label}
            <div style={{fontSize:11,fontWeight:400,opacity:0.75,marginTop:2,color:'#e8c870'}}>{sub}</div>
          </button>
        ))}
      </div>

    </div>
  );

  // ── 게임 설정 패널 ──────────────────────────────────────
  const BtnSm=({active,onClick,children,style={}})=>(
    <button onClick={onClick} style={{padding:'3px 7px',borderRadius:6,border:active?'1.5px solid #f5d77e':'1.5px solid #444',background:active?'#5c2a00':'#1a1a1a',color:active?'#f5d77e':'#888',cursor:'pointer',fontSize:11,marginLeft:3,...style}}>{children}</button>
  );

  const LevelSelect=({value,onChange,label})=>(
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <span style={{color:'#c8a96e',fontSize:11}}>{label}</span>
      {[1,2,3].map(lv=>(
        <button key={lv} onClick={()=>onChange(lv)}
          style={{padding:'4px 14px',borderRadius:7,border:value===lv?'1.5px solid #f5d77e':'1.5px solid #333',background:value===lv?LEVEL_BG[lv]:'#111',color:value===lv?LEVEL_COLORS[lv]:'#555',cursor:'pointer',fontSize:12,fontWeight:700}}>
          {LEVEL_NAMES[lv]}
        </button>
      ))}
    </div>
  );

  const renderSettings=()=>(
    <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'center',marginBottom:6,padding:'0 6px'}}>
      {mode==='pva'&&(
        <>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{color:'#c8a96e',fontSize:11}}>내 돌:</span>
            {[BLACK,WHITE].map(col=><BtnSm key={col} active={playerColor===col} onClick={()=>{setPlayerColor(col);resetGame();setMode('pva');}}>{col===BLACK?'⚫흑':'⚪백'}</BtnSm>)}
          </div>
          <LevelSelect value={aiLevel} onChange={setAiLevel} label="AI 레벨:"/>
        </>
      )}
      {mode==='ava'&&(
        <>
          <LevelSelect value={aiLevel} onChange={setAiLevel} label="흑 AI:"/>
          <LevelSelect value={aiLevel2} onChange={setAiLevel2} label="백 AI:"/>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{color:'#c8a96e',fontSize:11}}>속도:</span>
            {[[1600,'느림'],[1000,'보통'],[400,'빠름']].map(([v,l])=><BtnSm key={v} active={avaSpeed===v} onClick={()=>setAvaSpeed(v)}>{l}</BtnSm>)}
          </div>
        </>
      )}
    </div>
  );

  const isPlayerTurn=mode==='pvp'||(mode==='pva'&&turn===playerColor);
  const showTimer=timeLimit>0&&!winner&&mode!=='ava'&&isPlayerTurn;
  const turnBg=turn===BLACK?'#f5d77e':'#444';
  const turnCol=turn===BLACK?'#111':'#fff';

  return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at center,#1a0a00,#050200)',display:'flex',flexDirection:'column',alignItems:'center',paddingTop:6,paddingBottom:12,fontFamily:'serif',boxSizing:'border-box'}}>
      {/* 상단 바 */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,width:'100%',maxWidth:boardPx,padding:'0 6px',boxSizing:'border-box'}}>
        <button onClick={()=>{resetGame();setMode(null);}}
          style={{background:'none',border:'1px solid #5a3000',color:'#c8a96e',borderRadius:7,padding:'3px 8px',cursor:'pointer',fontSize:11,whiteSpace:'nowrap'}}>← 메뉴</button>
        <h2 style={{color:'#f5d77e',margin:0,fontSize:'clamp(11px,3.5vw,16px)',fontWeight:800,flex:1,textAlign:'center',letterSpacing:0.5}}>
          {mode==='pvp'?'2인 대전':mode==='pva'?`AI 대전 (${LEVEL_NAMES[aiLevel]})` :'AI vs AI'}
        </h2>
        <span style={{color:'#c8a96e',fontSize:11,whiteSpace:'nowrap'}}>{moveCount}수</span>
      </div>

      {renderSettings()}

      {/* 상태 + 타이머 */}
      <div style={{marginBottom:5,display:'flex',alignItems:'center',gap:8,minHeight:30}}>
        {winner?(
          <div style={{background:'linear-gradient(90deg,#f5d77e,#e8b84b)',color:'#1a0a00',borderRadius:20,padding:'4px 18px',fontWeight:800,fontSize:14}}>
            {winner===BLACK?'⚫ 흑':'⚪ 백'} 승리! 🎉
          </div>
        ):(
          <div style={{background:turnBg,color:turnCol,borderRadius:20,padding:'4px 14px',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:5}}>
            {turn===BLACK?'⚫ 흑':'⚪ 백'} 차례
            {mode==='pva'&&turn!==playerColor&&<span style={{fontSize:10,opacity:0.8}}>AI 생각 중...</span>}
          </div>
        )}
        {showTimer&&(
          <div style={{background:'#0d0800',border:`2px solid ${timerColor(timeLeft)}`,borderRadius:10,padding:'3px 12px',color:timerColor(timeLeft),fontWeight:800,fontSize:15,minWidth:46,textAlign:'center',boxShadow:timeLeft<=10?`0 0 8px ${timerColor(timeLeft)}88`:'none'}}>
            {timeLeft}s
          </div>
        )}
      </div>



      {/* 보드 */}
      <div style={{position:'relative',width:boardPx,height:boardPx,background:'linear-gradient(135deg, #ebd699, #d0a45c)',borderRadius:12,boxShadow:'0 12px 36px rgba(0,0,0,0.6), inset 0 2px 5px rgba(255,255,255,0.4)',border:'2px solid #8b5a2b',flexShrink:0,touchAction:'none'}}
        onMouseLeave={()=>{}}>
        <svg style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none'}}>
          {Array.from({length:SIZE},(_,i)=>(
            <g key={i}>
              <line x1={PAD} y1={PAD+i*CELL} x2={PAD+(SIZE-1)*CELL} y2={PAD+i*CELL} stroke="#6b4423" strokeWidth="1"/>
              <line x1={PAD+i*CELL} y1={PAD} x2={PAD+i*CELL} y2={PAD+(SIZE-1)*CELL} stroke="#6b4423" strokeWidth="1"/>
            </g>
          ))}
          {[[3,3],[3,11],[7,7],[11,3],[11,11],[3,7],[7,3],[7,11],[11,7]].map(([r,c])=>(
            <circle key={r+'-'+c} cx={PAD+c*CELL} cy={PAD+r*CELL} r={Math.max(3,CELL*0.1)} fill="#6b4423"/>
          ))}
        </svg>

        {Array.from({length:SIZE},(_,r)=>
          Array.from({length:SIZE},(_,c)=>{
            const stone=board[r][c];
            const forbidden=stone===EMPTY&&turn===BLACK&&isForbiddenCell(r,c)&&!winner;
            const win=isWinCell(r,c);
            const last=isLastMove(r,c);
            const pend=isPending(r,c);
            const canPlace=stone===EMPTY&&!forbidden&&!winner&&(mode==='pvp'||(mode==='pva'&&turn===playerColor));
            const x=PAD+c*CELL, y=PAD+r*CELL;

            return(
              <div key={r+'-'+c}
                style={{position:'absolute',left:x-R,top:y-R,width:R*2,height:R*2,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',zIndex:stone?2:1,cursor:canPlace?'pointer':'default'}}
                onClick={()=>handleClick(r,c)}>
                {stone===BLACK&&(
                  <div style={{width:R*2,height:R*2,borderRadius:'50%',background:win?'radial-gradient(circle at 30% 30%, #666, #000 70%)':'radial-gradient(circle at 30% 30%, #555, #000 70%)',border:win?'3px solid #f5d77e':'1px solid #111',boxShadow:win?'0 0 16px #f5d77e':'0 4px 8px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {last&&<div style={{width:R*0.35,height:R*0.35,borderRadius:'50%',background:'#e74c3c',boxShadow:'0 0 4px rgba(0,0,0,0.5)'}}/>}
                  </div>
                )}
                {stone===WHITE&&(
                  <div style={{width:R*2,height:R*2,borderRadius:'50%',background:win?'radial-gradient(circle at 30% 30%, #fff, #d4d4d4 70%)':'radial-gradient(circle at 30% 30%, #ffffff, #cfcfcf 70%)',border:win?'3px solid #f5d77e':'1px solid #c0c0c0',boxShadow:win?'0 0 16px #f5d77e':'0 4px 8px rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {last&&<div style={{width:R*0.35,height:R*0.35,borderRadius:'50%',background:'#e74c3c',boxShadow:'0 0 4px rgba(0,0,0,0.5)'}}/>}
                  </div>
                )}
                {!stone&&pend&&(
                  <div style={{width:R*2,height:R*2,borderRadius:'50%',background:turn===BLACK?'radial-gradient(circle at 35% 30%,#666,#111)':'radial-gradient(circle at 35% 30%,#fff,#bbb)',opacity:0.8,border:`2px solid #f5d77e`,boxShadow:'0 0 8px #f5d77e88'}}/>
                )}
                {!stone&&!pend&&forbidden&&(
                  <span style={{color:'#e74c3c',fontSize:R*1.05,lineHeight:1,fontWeight:900,opacity:0.8}}>✕</span>
                )}
                
              </div>
            );
          })
        )}
      </div>

      {/* 금수 안내 */}
      {turn===BLACK&&!winner&&mode!=='ava'&&(
        <div style={{marginTop:4,color:'#e74c3c88',fontSize:10}}>
          ✕ = 금수 자리 (3-3 / 4-4 / 장목)
        </div>
      )}

      {/* 하단 컨트롤 */}
      <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap',justifyContent:'center'}}>
        {pending&&isPlayerTurn&&!winner&&(
          <button onClick={confirmMove}
            style={{background:'#27ae60',color:'#fff',border:'2px solid #2ecc71',borderRadius:10,padding:'9px 22px',fontSize:14,fontWeight:800,cursor:'pointer',boxShadow:'0 0 10px #27ae6088'}}>
            ✅ 확인 ({String.fromCharCode(65+pending[1])}{SIZE-pending[0]})
          </button>
        )}
      
        {mode==='ava'&&!winner&&(
          <button onClick={()=>setAvaRunning(r=>!r)}
            style={{background:avaRunning?'#8B0000':'#1a4a1a',color:'#fff',border:`1px solid ${avaRunning?'#e74':'#4a4'}`,borderRadius:9,padding:'8px 20px',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            {avaRunning?'⏸ 일시정지':'▶ 시작'}
          </button>
        )}
        {(mode==='pvp'||mode==='pva')&&!winner&&history.length>0&&(
          <button onClick={handleUndo}
            style={{background:'#1a1a2a',color:'#aac',border:'1px solid #445',borderRadius:9,padding:'8px 14px',fontSize:12,cursor:'pointer'}}>
            ↩ 무르기
          </button>
        )}
        <button onClick={resetGame}
          style={{background:'linear-gradient(135deg,#5c2a00,#a0500a)',color:'#f5d77e',border:'1px solid #f5d77e55',borderRadius:9,padding:'8px 16px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
          🔄 새 게임
        </button>
      </div>

      <div style={{marginTop:6,color:'#5a3a0088',fontSize:10,textAlign:'center'}}>
        렌주룰 · 흑: 3-3 / 4-4 / 장목 금수 · 백: 제한 없음
      </div>
    </div>
  );
}