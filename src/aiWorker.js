/* eslint-disable no-restricted-globals */
const SIZE = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

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

const withStone = (board, r, c, color) => {
  const tmp = board.map(row=>[...row]); tmp[r][c]=color; return tmp;
};

function makesFive(board, r, c) {
  const tmp = withStone(board,r,c,BLACK);
  for(const [dr,dc] of DIRS){
    const {count} = lineInfo(tmp,r,c,dr,dc,BLACK);
    if(count===5) return true;
  }
  return false;
}

function isOverline(board, r, c) {
  const tmp = withStone(board,r,c,BLACK);
  for(const [dr,dc] of DIRS){
    const {count} = lineInfo(tmp,r,c,dr,dc,BLACK);
    if(count>=6) return true;
  }
  return false;
}

function countFoursInDir(board, r, c, dr, dc) {
  let cnt = 0;
  for(let start=-4; start<=0; start++){
    const cells = [];
    for(let i=0; i<5; i++){
      const nr=r+(start+i)*dr, nc=c+(start+i)*dc;
      if(!inBounds(nr,nc)){cells.push('X');continue;}
      cells.push(board[nr][nc]);
    }
    const blacks = cells.filter(v=>v===BLACK).length;
    const empties = cells.filter(v=>v===EMPTY).length;
    const walls = cells.filter(v=>v==='X'||v===WHITE).length;
    if(blacks===4 && empties===1 && walls===0) {
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
  return cnt>0?1:0;
}

function countFours(board, r, c) {
  if(board[r][c]!==EMPTY) return 0;
  const tmp = withStone(board,r,c,BLACK);
  let cnt=0;
  for(const [dr,dc] of DIRS) cnt+=countFoursInDir(tmp,r,c,dr,dc);
  return cnt;
}

function isOpenThreeInDir(board, r, c, dr, dc) {
  for(let start=-5; start<=0; start++){
    const cells=[];
    const coords=[];
    for(let i=0;i<6;i++){
      const nr=r+(start+i)*dr, nc=c+(start+i)*dc;
      if(!inBounds(nr,nc)){cells.push('X');coords.push(null);continue;}
      cells.push(board[nr][nc]);coords.push([nr,nc]);
    }
    if(cells[0]!==EMPTY || cells[5]!==EMPTY) continue;
    const mid = cells.slice(1,5);
    const blacks = mid.filter(v=>v===BLACK).length;
    const empties = mid.filter(v=>v===EMPTY).length;
    if(blacks!==3 || empties!==1) continue;
    for(let i=1;i<=4;i++){
      if(cells[i]===EMPTY && coords[i]){
        const [er,ec]=coords[i];
        const tmp2=board.map(row=>[...row]); tmp2[er][ec]=BLACK;
        const {count,openF,openB}=lineInfo(tmp2,er,ec,dr,dc,BLACK);
        if(count===4 && openF && openB) return true;
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

function isForbidden(board, r, c) {
  if(board[r][c]!==EMPTY) return false;
  if(makesFive(board,r,c)) return false;
  if(isOverline(board,r,c)) return true;
  if(countFours(board,r,c)>=2) return true;
  if(countOpenThrees(board,r,c)>=2) return true;
  return false;
}

// ── 평가함수 ──────────────────────────────────────────────
const SC = {
  five:10000000, openFour:500000, four:50000,
  openThree:10000, three:2000, openTwo:500, two:100, one:10
};

function evalLine(count, openF, openB) {
  const o = (openF?1:0)+(openB?1:0);
  if (count>=5) return SC.five;
  if (count===4) return o===2?SC.openFour:SC.four;
  if (count===3) return o===2?SC.openThree:SC.three;
  if (count===2) return o===2?SC.openTwo:SC.two;
  if (count===1) return o===2?SC.one:0;
  return 0;
}

const CENTER_BONUS = (() => {
  const b = [];
  for (let r=0;r<SIZE;r++) { b[r]=[];
    for (let c=0;c<SIZE;c++) {
      const d = Math.max(Math.abs(r-7), Math.abs(c-7));
      b[r][c] = Math.max(0, (7-d)*3);
    }
  }
  return b;
})();

function scorePos(board, r, c, color) {
  let s = CENTER_BONUS[r][c];
  for (const [dr,dc] of DIRS) {
    const {count,openF,openB} = lineInfo(board,r,c,dr,dc,color);
    s += evalLine(count,openF,openB);
  }
  return s;
}

function threatScore(board, r, c, color) {
  const tmp = board.map(row=>[...row]); tmp[r][c]=color;
  let openThrees=0, fours=0, openFours=0;
  for (const [dr,dc] of DIRS) {
    const {count,openF,openB} = lineInfo(tmp,r,c,dr,dc,color);
    const o=(openF?1:0)+(openB?1:0);
    if(count===3&&o===2) openThrees++;
    if(count===4&&o===1) fours++;
    if(count===4&&o===2) openFours++;
  }
  let bonus = 0;
  if(openFours>=1) bonus+=2000000;
  if(fours>=2) bonus+=1000000;
  if(fours>=1&&openThrees>=1) bonus+=800000;
  if(openThrees>=2) bonus+=400000;
  if(openThrees>=1) bonus+=50000;
  return bonus;
}

function getCandidates(board, range=2) {
  const visited=new Set(), cands=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++)
    if(board[r][c]!==EMPTY)
      for(let dr=-range;dr<=range;dr++) for(let dc=-range;dc<=range;dc++){
        const nr=r+dr, nc=c+dc;
        if(inBounds(nr,nc)&&board[nr][nc]===EMPTY){
          const key=nr*SIZE+nc;
          if(!visited.has(key)){visited.add(key);cands.push([nr,nc]);}
        }
      }
  if(cands.length===0) cands.push([7,7]);
  return cands;
}

// ── AI ────────────────────────────────────────────────────
function getDepthAndParams(level) {
  if (level===1) return {depth:2,  cands:8,  randFactor:100};
  if (level===2) return {depth:4,  cands:15, randFactor:0};
  return              {depth:10, cands:15, randFactor:0}; // 고수: depth 10, Worker에서 실행
}

function aiMove(board, color, level) {
  const opp = color===BLACK?WHITE:BLACK;
  const {depth, cands:maxCands, randFactor} = getDepthAndParams(level);
  const allCands = getCandidates(board, level===3?3:2);

  // 즉시 승리
  for (const [r,c] of allCands) {
    if(color===BLACK&&isForbidden(board,r,c)) continue;
    const tmp=board.map(row=>[...row]); tmp[r][c]=color;
    if(checkWin(tmp,r,c,color)) return [r,c];
  }
  // 즉시 차단
  for (const [r,c] of allCands) {
    if(color===BLACK&&isForbidden(board,r,c)) continue;
    const tmp=board.map(row=>[...row]); tmp[r][c]=opp;
    if(checkWin(tmp,r,c,opp)) return [r,c];
  }

  // 초보: 랜덤 혼합
  if (level===1) {
    if(Math.random()<0.7) {
      const valid=allCands.filter(([r,c])=>!(color===BLACK&&isForbidden(board,r,c)));
      return valid[Math.floor(Math.random()*Math.min(valid.length,10))];
    }
  }

  // 후보 정렬
  const scored = allCands
    .filter(([r,c])=>!(color===BLACK&&isForbidden(board,r,c)))
    .map(([r,c])=>{
      const atk=scorePos(board,r,c,color)+threatScore(board,r,c,color);
      const def=scorePos(board,r,c,opp)+threatScore(board,r,c,opp);
      const rand=randFactor>0?Math.random()*randFactor:0;
      return {r,c,s:atk*1.4+def+rand};
    })
    .sort((a,b)=>b.s-a.s)
    .slice(0,maxCands);

  if (depth<=1) return scored[0]?[scored[0].r,scored[0].c]:allCands[0];

  // 열린4 즉시 공격
  if (level>=2) {
    for (const {r,c} of scored.slice(0,15)) {
      const tmp=board.map(row=>[...row]); tmp[r][c]=color;
      for (const [dr,dc] of DIRS) {
        const {count,openF,openB}=lineInfo(tmp,r,c,dr,dc,color);
        if(count===4&&openF&&openB) return [r,c];
      }
    }
  }

  // 미니맥스 + 알파베타
  const killerMoves = new Array(depth+1).fill(null).map(()=>[]);

  function evaluate(b, aiColor) {
    let total=0;
    const oppColor=aiColor===BLACK?WHITE:BLACK;
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
      if(b[r][c]===EMPTY){
        total+=scorePos(b,r,c,aiColor)*0.3;
        total-=scorePos(b,r,c,oppColor)*0.3;
      }
    }
    return total;
  }

  function minimax(b, d, isMax, alpha, beta, curTurn, ply) {
    const oppTurn=curTurn===BLACK?WHITE:BLACK;
    const moveTurn=isMax?curTurn:oppTurn;
    const moveColor=isMax?color:opp;

    // depth가 깊을수록 후보수를 줄여 탐색 시간을 관리
    const candLimit = d>=9?10:d>=7?12:d>=5?15:d>=4?18:d>=3?14:9;

    let moves = getCandidates(b, d>=5?3:2)
      .filter(([r,c])=>!(moveTurn===BLACK&&isForbidden(b,r,c)))
      .map(([r,c])=>({r,c,s:scorePos(b,r,c,moveColor)+threatScore(b,r,c,moveColor)*1.2}))
      .sort((a,b2)=>b2.s-a.s)
      .slice(0, candLimit);

    // 킬러 무브 우선
    if(killerMoves[ply]?.length) {
      const km=killerMoves[ply];
      moves.sort((a,b2)=>{
        const aK=km.some(k=>k[0]===a.r&&k[1]===a.c)?1:0;
        const bK=km.some(k=>k[0]===b2.r&&k[1]===b2.c)?1:0;
        return bK-aK;
      });
    }

    if(d===0||moves.length===0) return evaluate(b, color);

    if(isMax){
      let val=-Infinity;
      for(const {r,c} of moves){
        b[r][c]=moveTurn;
        if(checkWin(b,r,c,moveTurn)){b[r][c]=EMPTY;return SC.five-(10-d)*1000;}
        const v=minimax(b,d-1,false,alpha,beta,curTurn,ply+1);
        b[r][c]=EMPTY;
        if(v>val) val=v;
        alpha=Math.max(alpha,val);
        if(beta<=alpha){
          if(!killerMoves[ply]) killerMoves[ply]=[];
          killerMoves[ply].unshift([r,c]);
          if(killerMoves[ply].length>2) killerMoves[ply].pop();
          break;
        }
      }
      return val;
    } else {
      let val=Infinity;
      for(const {r,c} of moves){
        b[r][c]=moveTurn;
        if(checkWin(b,r,c,moveTurn)){b[r][c]=EMPTY;return -(SC.five-(10-d)*1000);}
        const v=minimax(b,d-1,true,alpha,beta,curTurn,ply+1);
        b[r][c]=EMPTY;
        if(v<val) val=v;
        beta=Math.min(beta,val);
        if(beta<=alpha) break;
      }
      return val;
    }
  }

  let best=null, bestScore=-Infinity;
  for(const {r,c} of scored){
    const tmp=board.map(row=>[...row]); tmp[r][c]=color;
    if(checkWin(tmp,r,c,color)) return [r,c];
    const s=minimax(tmp,depth-1,false,-Infinity,Infinity,color,0);
    if(s>bestScore){bestScore=s;best=[r,c];}
  }
  return best||(scored[0]?[scored[0].r,scored[0].c]:allCands[0]);
}

// ── Worker 메시지 핸들러 ──────────────────────────────────
self.onmessage = function(e) {
  const { board, color, level } = e.data;
  const move = aiMove(board, color, level);
  self.postMessage(move);
};
