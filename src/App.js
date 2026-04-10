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

// 연속 돌 개수 (한 방향)
function countStones(board, r, c, dr, dc, color) {
  let cnt=0, nr=r+dr, nc=c+dc;
  while(inBounds(nr,nc) && board[nr][nc]===color){cnt++;nr+=dr;nc+=dc;}
  return cnt;
}

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

function getForbiddenType(board, r, c) {
  if(board[r][c]!==EMPTY) return null;
  if(makesFive(board,r,c)) return null;
  if(isOverline(board,r,c)) return '장목';
  if(countFours(board,r,c)>=2) return '44';
  if(countOpenThrees(board,r,c)>=2) return '33';
  return null;
}

// ── 평가함수 ─────────────────────────────────────────────
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

// 중앙 근접 보너스
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

// ── AI (레벨 1~12) ───────────────────────────────────────
function getDepthAndParams(level) {
  if (level<=2) return {depth:1, cands:5, randFactor:level===1?200:80};
  if (level<=4) return {depth:2, cands:8, randFactor:level===3?30:10};
  if (level<=6) return {depth:2, cands:12, randFactor:0};
  if (level<=8) return {depth:3, cands:15, randFactor:0};
  if (level<=10) return {depth:4, cands:15, randFactor:0};
  return {depth:5, cands:20, randFactor:0};
}

function aiMove(board, color, level) {
  const opp = color===BLACK?WHITE:BLACK;
  const {depth, cands:maxCands, randFactor} = getDepthAndParams(level);
  const allCands = getCandidates(board, level>=10?3:2);

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

  // 레벨 1~2: 랜덤 혼합
  if (level<=2) {
    if(Math.random()<(level===1?0.7:0.3)) {
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

  // 레벨 5~6: 열린4 즉시 공격
  if (level>=5) {
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

  function minimax(b, d, isMax, alpha, beta, turn, ply) {
    const oppTurn=turn===BLACK?WHITE:BLACK;
    const moveTurn=isMax?turn:oppTurn;
    const moveColor=isMax?color:opp;

    let moves = getCandidates(b, d>=3?3:2)
      .filter(([r,c])=>!(moveTurn===BLACK&&isForbidden(b,r,c)))
      .map(([r,c])=>({r,c,s:scorePos(b,r,c,moveColor)+threatScore(b,r,c,moveColor)*1.2+(isMax?0:scorePos(b,r,c,color===BLACK?WHITE:BLACK))}))
      .sort((a,b2)=>b2.s-a.s)
      .slice(0, d>=4?18:d>=3?14:9);

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
        if(checkWin(b,r,c,moveTurn)){b[r][c]=EMPTY;return SC.five-(5-d)*1000;}
        const v=minimax(b,d-1,false,alpha,beta,turn,ply+1);
        b[r][c]=EMPTY;
        if(v>val){val=v;}
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
        if(checkWin(b,r,c,moveTurn)){b[r][c]=EMPTY;return -(SC.five-(5-d)*1000);}
        const v=minimax(b,d-1,true,alpha,beta,turn,ply+1);
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

// ── 한국인이 좋아하는 팝송 100곡 YouTube ID ──────────────
const POPSONGS = [
  {title:'Shape of You',artist:'Ed Sheeran',id:'JGwWNGJdvx8'},
  {title:'Blinding Lights',artist:'The Weeknd',id:'4NRXx6U8ABQ'},
  {title:'Someone Like You',artist:'Adele',id:'hLQl3WQQoQ0'},
  {title:'Rolling in the Deep',artist:'Adele',id:'rYEDA3JcQqw'},
  {title:'Happy',artist:'Pharrell Williams',id:'ZbZSe6N_BXs'},
  {title:'Uptown Funk',artist:'Bruno Mars',id:'OPf0YbXqDm0'},
  {title:'Stay With Me',artist:'Sam Smith',id:'pB-5XG-DbAA'},
  {title:'Thinking Out Loud',artist:'Ed Sheeran',id:'lp-EO5I60KA'},
  {title:'Let Her Go',artist:'Passenger',id:'RBumgq5yVrA'},
  {title:'Counting Stars',artist:'OneRepublic',id:'hT_nvWreIhg'},
  {title:'Photograph',artist:'Ed Sheeran',id:'nSDgHBxUbVQ'},
  {title:'Perfect',artist:'Ed Sheeran',id:'2Vv-BfVoq4g'},
  {title:'All of Me',artist:'John Legend',id:'450p7goxZqg'},
  {title:'See You Again',artist:'Wiz Khalifa',id:'RgKAFK5djSk'},
  {title:'Shallow',artist:'Lady Gaga',id:'bo_efYhYU2A'},
  {title:'A Thousand Years',artist:'Christina Perri',id:'rtOvBOTyX00'},
  {title:'Poker Face',artist:'Lady Gaga',id:'bESGLojNYSo'},
  {title:'Bad Guy',artist:'Billie Eilish',id:'DyDfgMOUjCI'},
  {title:'Levitating',artist:'Dua Lipa',id:'TUVcZfQe-Kw'},
  {title:'Watermelon Sugar',artist:'Harry Styles',id:'E07s5ZYygMg'},
  {title:'Dynamite',artist:'BTS',id:'gdZLi9oWNZg'},
  {title:'Butter',artist:'BTS',id:'WMweEpGlu_U'},
  {title:'Permission to Dance',artist:'BTS',id:'CuklIb9d3fI'},
  {title:'LALISA',artist:'LISA',id:'awkkyBH2zEo'},
  {title:'Pink Venom',artist:'BLACKPINK',id:'nSD9lMVMCuA'},
  {title:'Attention',artist:'NewJeans',id:'ArmDp-zijuc'},
  {title:'Hype Boy',artist:'NewJeans',id:'MirbCiMhIPE'},
  {title:'Love Dive',artist:'IVE',id:'4vbDFu0PUew'},
  {title:'After LIKE',artist:'IVE',id:'F0B7HDiY-10'},
  {title:'Nxde',artist:'(G)I-DLE',id:'yYK9uaAVCGw'},
  {title:'Believer',artist:'Imagine Dragons',id:'7wtfhZwyrcc'},
  {title:'Thunder',artist:'Imagine Dragons',id:'va0PTsJxBLE'},
  {title:'Demons',artist:'Imagine Dragons',id:'mWRsgZuwf_8'},
  {title:'Radioactive',artist:'Imagine Dragons',id:'ktvTqknDobU'},
  {title:'Stressed Out',artist:'Twenty One Pilots',id:'pXRviuL6vMY'},
  {title:'Ride',artist:'Twenty One Pilots',id:'Pw-4kopvmi8'},
  {title:'Mr. Brightside',artist:'The Killers',id:'gGdGFtwCNBE'},
  {title:'Human',artist:'The Killers',id:'RIZdjT9SCPE'},
  {title:'Viva La Vida',artist:'Coldplay',id:'dvgZkm1xWPE'},
  {title:'The Scientist',artist:'Coldplay',id:'RB-RcX5DS5A'},
  {title:'Fix You',artist:'Coldplay',id:'k4V3Mo61fJM'},
  {title:'Yellow',artist:'Coldplay',id:'yKNxeF4KMsY'},
  {title:'Clocks',artist:'Coldplay',id:'d020hcWA_Wg'},
  {title:'Someone You Loved',artist:'Lewis Capaldi',id:'zABZyahH4t0'},
  {title:'Before You Go',artist:'Lewis Capaldi',id:'_V2sBURgUBI'},
  {title:'Heat Waves',artist:'Glass Animals',id:'mRD0-GxqHVo'},
  {title:'drivers license',artist:'Olivia Rodrigo',id:'ZmDBbnmKpqQ'},
  {title:'good 4 u',artist:'Olivia Rodrigo',id:'gNi_6U5Pm_o'},
  {title:'traitor',artist:'Olivia Rodrigo',id:'4ux2oDHMFiA'},
  {title:'Peaches',artist:'Justin Bieber',id:'tQ0yjYMHNkM'},
  {title:'Stay',artist:'Justin Bieber',id:'iom4fQOiMW8'},
  {title:'Love Yourself',artist:'Justin Bieber',id:'oyEuk8j8imI'},
  {title:'Sorry',artist:'Justin Bieber',id:'fRh_vgS2dFE'},
  {title:'Anti-Hero',artist:'Taylor Swift',id:'b1kbLwvqugk'},
  {title:'Shake It Off',artist:'Taylor Swift',id:'nfWlot6h_JM'},
  {title:'Blank Space',artist:'Taylor Swift',id:'e-ORhEE9VVg'},
  {title:'Bad Blood',artist:'Taylor Swift',id:'QcIy9NiNbmo'},
  {title:'Cruel Summer',artist:'Taylor Swift',id:'ic8j13piAhQ'},
  {title:'As It Was',artist:'Harry Styles',id:'H5v3kku4y6Q'},
  {title:'Adore You',artist:'Harry Styles',id:'VF-r5TtlT9w'},
  {title:'Flowers',artist:'Miley Cyrus',id:'G7KNmW9a75Y'},
  {title:'Midnight Rain',artist:'Taylor Swift',id:'yY8BO4x7OX4'},
  {title:'Positions',artist:'Ariana Grande',id:'tcYodQoapMg'},
  {title:'7 rings',artist:'Ariana Grande',id:'QYh6mYIJG2Y'},
  {title:'thank u, next',artist:'Ariana Grande',id:'gl1aHhXnN1k'},
  {title:'God is a woman',artist:'Ariana Grande',id:'kHLHSlExFis'},
  {title:'Lose You To Love Me',artist:'Selena Gomez',id:'_1OfTeZLioo'},
  {title:'Come & Get It',artist:'Selena Gomez',id:'pCTae4TPFCE'},
  {title:'Wolves',artist:'Selena Gomez',id:'0n7jEexKnOQ'},
  {title:'Dance Monkey',artist:'Tones and I',id:'q0hyYWKXF0Q'},
  {title:'Havana',artist:'Camila Cabello',id:'HCjNJDNzw8Y'},
  {title:'Señorita',artist:'Shawn Mendes',id:'Pkh8UtuejGw'},
  {title:'Stitches',artist:'Shawn Mendes',id:'VbfpW0pbvaU'},
  {title:'Treat You Better',artist:'Shawn Mendes',id:'lY2yjAdbvdQ'},
  {title:'Mercy',artist:'Shawn Mendes',id:'Lp7E973LKQE'},
  {title:'One Dance',artist:'Drake',id:'iuqXFC_qIvA'},
  {title:'Hotline Bling',artist:'Drake',id:'uxpDa-c-4Mc'},
  {title:'God\'s Plan',artist:'Drake',id:'xpVfcZ0ZcFM'},
  {title:'Circles',artist:'Post Malone',id:'21qNxnCS8WU'},
  {title:'Sunflower',artist:'Post Malone',id:'ApXoWvfEYVU'},
  {title:'Rockstar',artist:'Post Malone',id:'UceaB4D0jpo'},
  {title:'Bohemian Rhapsody',artist:'Queen',id:'fJ9rUzIMcZQ'},
  {title:'Don\'t Stop Me Now',artist:'Queen',id:'HgzGwKwLmgM'},
  {title:'We Will Rock You',artist:'Queen',id:'-tJYN-eG1zk'},
  {title:'Hotel California',artist:'Eagles',id:'BciS5krYL80'},
  {title:'Smells Like Teen Spirit',artist:'Nirvana',id:'hTWKbfoikeg'},
  {title:'Wonderwall',artist:'Oasis',id:'bx1Bh8ZvH84'},
  {title:'Yesterday',artist:'Beatles',id:'NrgmdOz227I'},
  {title:'Let It Be',artist:'Beatles',id:'QDYfEBY9NM4'},
  {title:'Hey Jude',artist:'Beatles',id:'A_MjCqQoLLA'},
  {title:'Imagine',artist:'John Lennon',id:'YkgkThdzX-8'},
  {title:'Billie Jean',artist:'Michael Jackson',id:'Zi_XLOBDo_Y'},
  {title:'Thriller',artist:'Michael Jackson',id:'sOnqjkJTMaA'},
  {title:'Beat It',artist:'Michael Jackson',id:'oRdxUFDoQe0'},
  {title:'I Will Always Love You',artist:'Whitney Houston',id:'3JWTaaS7LdU'},
  {title:'My Heart Will Go On',artist:'Celine Dion',id:'WNIPqafd4As'},
  {title:'Hello',artist:'Adele',id:'YQHsXMglC9A'},
  {title:'Set Fire to the Rain',artist:'Adele',id:'Ri7-vnrJD3k'},
  {title:'Skyfall',artist:'Adele',id:'DeumyOPc9WA'},
];

// ── YouTube 음악 플레이어 ─────────────────────────────────
function useYouTubeMusic() {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [musicOn, setMusicOn] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(null);
  const [ready, setReady] = useState(false);
  const shuffledRef = useRef([]);

  // 셔플 리스트 생성
  const makeShuffled = () => {
    const arr = [...Array(POPSONGS.length).keys()];
    for (let i = arr.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  };

  useEffect(() => {
    shuffledRef.current = makeShuffled();
    // YouTube IFrame API 로드
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = () => setReady(true);
    if (window.YT && window.YT.Player) setReady(true);
  }, []);

  const createPlayer = useCallback((videoId, idx) => {
    if (!window.YT || !window.YT.Player) return;
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch(e) {}
    }
    if (!document.getElementById('yt-player-div')) return;
    playerRef.current = new window.YT.Player('yt-player-div', {
      height: '1', width: '1',
      videoId,
      playerVars: { autoplay: 1, controls: 0, rel: 0, showinfo: 0, modestbranding: 1 },
      events: {
        onReady: (e) => { e.target.setVolume(40); e.target.playVideo(); },
        onStateChange: (e) => {
          if (e.data === window.YT.PlayerState.ENDED) playNext();
        },
        onError: () => playNext(),
      }
    });
    setCurrentIdx(idx);
  }, []);

  const playNext = useCallback(() => {
    const list = shuffledRef.current;
    if (!list.length) return;
    const nextPos = currentIdx !== null
      ? (list.indexOf(currentIdx) + 1) % list.length : 0;
    const nextIdx = list[nextPos];
    createPlayer(POPSONGS[nextIdx].id, nextIdx);
  }, [currentIdx, createPlayer]);

  const toggleMusic = useCallback(() => {
    setMusicOn(on => {
      if (on) {
        try { playerRef.current?.stopVideo(); } catch(e) {}
        return false;
      } else {
        const list = shuffledRef.current;
        const idx = list[Math.floor(Math.random() * list.length)];
        createPlayer(POPSONGS[idx].id, idx);
        return true;
      }
    });
  }, [createPlayer]);

  const playStone = useCallback((color) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = color === BLACK ? 180 : 360;
      g.gain.setValueAtTime(0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  }, []);

  const playWin = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
  }, []);

  const currentSong = currentIdx !== null ? POPSONGS[currentIdx] : null;

  return { musicOn, toggleMusic, playNext, currentSong, ready, playStone, playWin };
}

// ── 타이머 색상 ──────────────────────────────────────────
const timerColor=t=>t>20?'#4CAF50':t>10?'#FFC107':'#e74c3c';

const LEVEL_NAMES=['','왕초보','초보','입문','하급','중급','중상급','고급','상급','고수','달인','마스터','전설'];
const LEVEL_COLORS=['','#aaa','#88cc44','#44aaee','#4488ff','#aa44ff','#ff8800','#ff4400','#cc0000','#880088','#004488','#002266','#000000'];
const LEVEL_BG=['','#333','#2a3a1a','#1a2a3a','#1a2050','#2a1a40','#3a2800','#3a1800','#2a0000','#1a0028','#000e22','#000818','#000000'];

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
  const[aiLevel,setAiLevel]=useState(5);
  const[aiLevel2,setAiLevel2]=useState(5);
  const[avaSpeed,setAvaSpeed]=useState(600);
  const[avaRunning,setAvaRunning]=useState(false);
  const[forbiddenCells,setForbiddenCells]=useState([]);
  const[moveCount,setMoveCount]=useState(0);
  const[timeLimit,setTimeLimit]=useState(0);
  const[timeLeft,setTimeLeft]=useState(0);
  const[pending,setPending]=useState(null); // 착수 대기
  const avaRef=useRef(false);
  const boardRef=useRef(board);
  const turnRef=useRef(turn);
  const{musicOn,toggleMusic,playNext,currentSong,playStone,playWin}=useYouTubeMusic();

  boardRef.current=board;
  turnRef.current=turn;

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
  },[board,turn,lastMove,place,afterPlace,playStone,playWin]);

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
  const cancelPending=()=>setPending(null);

  // PvA AI
  useEffect(()=>{
    if(mode!=='pva'||winner||turn===playerColor)return;
    setPending(null);
    const lv=aiLevel;
    const delay=lv>=10?800:lv>=7?600:400;
    const timer=setTimeout(()=>{
      const b=boardRef.current;
      const mv=aiMove(b,turn,lv);
      if(!mv)return;
      const[r,c]=mv;
      const nb=b.map(row=>[...row]);nb[r][c]=turn;
      const{won,wc}=afterPlace(nb,r,c,turn);
      playStone(turn);
      setBoard(nb);setLastMove([r,c]);setMoveCount(p=>p+1);
      if(won){setWinner(turn);setWinCells(wc);playWin();return;}
      setTurn(t=>t===BLACK?WHITE:BLACK);
    },delay);
    return()=>clearTimeout(timer);
  },[turn,mode,playerColor,winner,aiLevel,afterPlace,playStone,playWin]);

  // AvA
  useEffect(()=>{
    if(mode!=='ava'||!avaRunning||winner)return;
    avaRef.current=true;
    const color=turnRef.current;
    const lv=color===BLACK?aiLevel:aiLevel2;
    const timer=setTimeout(()=>{
      if(!avaRef.current)return;
      const b=boardRef.current;
      const mv=aiMove(b,color,lv);
      if(!mv)return;
      const[r,c]=mv;
      const nb=b.map(row=>[...row]);nb[r][c]=color;
      const{won,wc}=afterPlace(nb,r,c,color);
      playStone(color);
      setBoard(nb);setLastMove([r,c]);setMoveCount(p=>p+1);
      if(won){setWinner(color);setWinCells(wc);setAvaRunning(false);playWin();return;}
      setTurn(t=>t===BLACK?WHITE:BLACK);
    },avaSpeed);
    return()=>{clearTimeout(timer);};
  },[turn,mode,avaRunning,winner,aiLevel,aiLevel2,avaSpeed,afterPlace,playStone,playWin]);

  const handleUndo=()=>{
    if(history.length===0)return;
    const last=history[history.length-1];
    setBoard(last.board);setTurn(last.turn);setLastMove(last.lastMove);
    setHistory(h=>h.slice(0,-1));setWinner(null);setWinCells([]);
    setMoveCount(p=>Math.max(0,p-1));setPending(null);
    if(timeLimit)setTimeLeft(timeLimit);
  };

  const resetGame=()=>{
    avaRef.current=false;
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
      {/* YouTube 숨김 플레이어 */}
      <div id="yt-player-div" style={{position:'fixed',bottom:-10,left:-10,width:1,height:1,overflow:'hidden',pointerEvents:'none'}}/>

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

      {/* 음악 버튼 */}
      <div style={{marginTop:20,position:'relative',zIndex:1,width:'100%',maxWidth:280}}>
        <button onClick={toggleMusic}
          style={{width:'100%',background:musicOn?'#1a3a1a':'#1a1a1a',color:'#f5d77e',border:'1px solid #f5d77e55',borderRadius:10,padding:'10px 16px',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
          <span>{musicOn?'🎵':'🔇'}</span>
          <div style={{flex:1,textAlign:'left'}}>
            <div style={{fontWeight:700}}>{musicOn?'음악 재생 중':'배경음악 OFF'}</div>
            {musicOn&&currentSong&&(
              <div style={{fontSize:11,opacity:0.75,marginTop:1}}>
                {currentSong.title} — {currentSong.artist}
              </div>
            )}
          </div>
          {musicOn&&<button onClick={e=>{e.stopPropagation();playNext();}}
            style={{background:'#2a4a2a',border:'1px solid #4a7a4a',color:'#fff',borderRadius:6,padding:'3px 8px',fontSize:11,cursor:'pointer'}}>
            ⏭ 다음
          </button>}
        </button>
      </div>
    </div>
  );

  // ── 게임 설정 패널 ──────────────────────────────────────
  const BtnSm=({active,onClick,children,style={}})=>(
    <button onClick={onClick} style={{padding:'3px 7px',borderRadius:6,border:active?'1.5px solid #f5d77e':'1.5px solid #444',background:active?'#5c2a00':'#1a1a1a',color:active?'#f5d77e':'#888',cursor:'pointer',fontSize:11,marginLeft:3,...style}}>{children}</button>
  );

  const LevelSelect=({value,onChange,label})=>(
    <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',justifyContent:'center'}}>
      <span style={{color:'#c8a96e',fontSize:11}}>{label}</span>
      <div style={{display:'flex',gap:2,flexWrap:'wrap',justifyContent:'center'}}>
        {Array.from({length:12},(_,i)=>i+1).map(lv=>(
          <button key={lv} onClick={()=>onChange(lv)}
            style={{width:22,height:22,borderRadius:4,border:value===lv?'1.5px solid #f5d77e':'1.5px solid #333',background:value===lv?LEVEL_BG[lv]:'#111',color:value===lv?LEVEL_COLORS[lv]:'#555',cursor:'pointer',fontSize:10,fontWeight:700,padding:0}}>
            {lv}
          </button>
        ))}
      </div>
      <span style={{color:LEVEL_COLORS[value],fontSize:11,fontWeight:700,background:LEVEL_BG[value],padding:'1px 6px',borderRadius:4,border:`1px solid ${LEVEL_COLORS[value]}44`}}>
        {LEVEL_NAMES[value]}
      </span>
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
          {mode==='pvp'?'2인 대전':mode==='pva'?`AI 대전 (Lv.${aiLevel} ${LEVEL_NAMES[aiLevel]})` :'AI vs AI'}
        </h2>
        <span style={{color:'#c8a96e',fontSize:11,whiteSpace:'nowrap'}}>{moveCount}수</span>
        <button onClick={toggleMusic}
          style={{background:musicOn?'#1a3a1a':'#1a1a1a',border:'1px solid #5a3000',color:'#f5d77e',borderRadius:7,padding:'3px 7px',cursor:'pointer',fontSize:12}}>
          {musicOn?'🎵':'🔇'}
        </button>
      </div>
      {/* 현재 곡명 표시 */}
      {musicOn&&currentSong&&(
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,maxWidth:boardPx,width:'100%',padding:'0 8px',boxSizing:'border-box'}}>
          <div style={{flex:1,background:'#0d0800',border:'1px solid #3a2000',borderRadius:8,padding:'4px 10px',fontSize:10,color:'#c8a96e',display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
            <span>🎵</span>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {currentSong.title} — {currentSong.artist}
            </span>
          </div>
          <button onClick={playNext}
            style={{background:'#1a2a1a',border:'1px solid #3a5a3a',color:'#aaa',borderRadius:7,padding:'4px 8px',fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
            ⏭ 다음
          </button>
        </div>
      )}

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
      <div style={{position:'relative',width:boardPx,height:boardPx,background:'linear-gradient(135deg,#c8913a,#a0702a,#8B5E1A)',borderRadius:8,boxShadow:'0 6px 24px #0009,inset 0 1px 0 #e8c87033',border:'3px solid #5a3000',flexShrink:0,touchAction:'none'}}
        onMouseLeave={()=>{}}>
        <svg style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none'}}>
          {Array.from({length:SIZE},(_,i)=>(
            <g key={i}>
              <line x1={PAD} y1={PAD+i*CELL} x2={PAD+(SIZE-1)*CELL} y2={PAD+i*CELL} stroke="#5a3000" strokeWidth="0.7"/>
              <line x1={PAD+i*CELL} y1={PAD} x2={PAD+i*CELL} y2={PAD+(SIZE-1)*CELL} stroke="#5a3000" strokeWidth="0.7"/>
            </g>
          ))}
          {[[3,3],[3,11],[7,7],[11,3],[11,11],[3,7],[7,3],[7,11],[11,7]].map(([r,c])=>(
            <circle key={r+'-'+c} cx={PAD+c*CELL} cy={PAD+r*CELL} r={Math.max(2.5,CELL*0.09)} fill="#5a3000"/>
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
                  <div style={{width:R*2,height:R*2,borderRadius:'50%',background:win?'radial-gradient(circle at 35% 30%,#888,#111 60%)':'radial-gradient(circle at 35% 30%,#666,#111 60%)',border:win?'2px solid #f5d77e':'1.5px solid #222',boxShadow:win?'0 0 12px #f5d77e':'0 2px 5px #0008',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {last&&<div style={{width:R*0.35,height:R*0.35,borderRadius:'50%',background:'#e74'}}/>}
                  </div>
                )}
                {stone===WHITE&&(
                  <div style={{width:R*2,height:R*2,borderRadius:'50%',background:win?'radial-gradient(circle at 35% 30%,#fff,#ccc 60%)':'radial-gradient(circle at 35% 30%,#fff,#bbb 60%)',border:win?'2px solid #f5d77e':'1.5px solid #999',boxShadow:win?'0 0 12px #f5d77e':'0 2px 5px #0005',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {last&&<div style={{width:R*0.35,height:R*0.35,borderRadius:'50%',background:'#e74'}}/>}
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