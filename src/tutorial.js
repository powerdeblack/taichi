// Guided first duel: a coach bubble walks the player through one real
// match, one action at a time, and each step only advances once the player
// has actually done it (moved, picked a target, held a card, landed a
// cast). The rival stands still and holds its cards until the "rival"
// steps, so nothing interrupts the lesson. main.js feeds it events via
// notify() and asks rivalActive() before letting the rival AI act.
import * as ui from './ui.js';

const DONE_KEY = 'axieDuelTutorialDone';
const DISMISS_KEY = 'axieDuelTutorialDismissed';
const MOVE_NEEDED = 1.2; // board units the squad must walk in the move step

const rivalChips = () => [0, 1, 2].map(i => ui.getLaneSideEl('rival', i)).filter(Boolean);
const youTankChip = (state) => {
  const i = state.youLanes.findIndex(l => l.isTank);
  return [ui.getLaneSideEl('you', i)].filter(Boolean);
};

const STEPS = [
  { advance: 'next', focus: youTankChip,
    text: 'Welcome to the snowfield! These 3 are your squad. The one marked 🛡️ is your <b>Tank</b> — if it falls, you lose. Knock out the rival\'s Tank to win.' },
  { advance: 'moved', focus: () => [document.getElementById('joystickBase')],
    text: '<b>Move:</b> hold the joystick and drag. Your whole squad walks together — anywhere on the snow. Walk a little now.' },
  { advance: 'selected', focus: rivalChips,
    text: '<b>Pick a target:</b> tap one of the rival\'s Axies (or its HP bar). A 🎯 appears over it and stays until you tap someone else.' },
  { advance: 'aiming', focus: () => [document.getElementById('hand')],
    text: '<b>Aim:</b> press and <b>hold</b> a card. A ring on the snow shows how far it reaches — <b>green</b> means your target is in range, <b>red</b> means too far.' },
  { advance: 'landed', focus: () => [document.getElementById('hand')],
    text: '<b>Cast:</b> let go to fire. The card charges on your Axie, flies, and lands about 3s later. Then all cards are locked until 5s have passed — wait for it to land.' },
  { advance: 'next', rival: true, focus: rivalChips,
    text: 'Now the rival fights back! Watch the <b>bar above its Axies</b> — it shows which card is coming. Tip: Heal and Defense cards work on your own Axies too — select one of yours first.' },
  { advance: 'next', rival: true, focus: () => [],
    text: 'Finish it: bring down the rival\'s 🛡️ Tank! At 2:00 a <b>Blizzard</b> hurts everyone and halves healing, and at <b>3:20</b> the match ends — the Tank with more HP left wins. The clock at the top shows how long you have. Good luck!' },
];

export function tutorialDone(){
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

// The tutorial is always optional: the invite on the team screen can be
// dismissed for good ("Not now"), leaving only a small header button.
export function tutorialDismissed(){
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
export function dismissTutorialInvite(){
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked */ }
}

function markDone(){
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* storage blocked */ }
}

export function createTutorial(getState){
  const coach = document.getElementById('coach');
  const stepEl = document.getElementById('coachStep');
  const textEl = document.getElementById('coachText');
  const nextBtn = document.getElementById('coachNext');
  const skipBtn = document.getElementById('coachSkip');
  let step = 0;
  let moved = 0;
  let active = true;
  let focused = [];

  function clearFocus(){
    focused.forEach(el => el.classList.remove('coach-focus'));
    focused = [];
  }

  function render(){
    const s = STEPS[step];
    stepEl.textContent = `Tutorial ${step + 1} / ${STEPS.length}`;
    textEl.innerHTML = s.text;
    nextBtn.textContent = step === STEPS.length - 1 ? 'Let\'s go!' : 'Next';
    nextBtn.classList.toggle('hidden', s.advance !== 'next');
    coach.classList.remove('hidden');
    refreshFocus();
  }

  // Unit tags only exist once the board is built (and move every frame),
  // so focus and bubble placement are refreshed every frame.
  function refreshFocus(){
    if (!active) return;
    const els = STEPS[step].focus(getState());
    if (!(els.length === focused.length && els.every((el, i) => el === focused[i]))){
      clearFocus();
      focused = els;
      focused.forEach(el => el.classList.add('coach-focus'));
    }
    placeCoach();
  }

  // Puts the bubble in the first screen spot that doesn't cover anything
  // it's pointing at (or the least-covering one) -- it must never sit on
  // top of the Axie or control it asks the player to touch.
  function placeCoach(){
    const w = coach.offsetWidth, h = coach.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight, m = 10;
    const cx = (vw - w) / 2;
    const spots = [
      [m, 48], [vw - w - m, 48], [cx, m], [m, (vh - h) / 2], [vw - w - m, (vh - h) / 2], [cx, vh - h - m],
    ];
    const rects = focused.map(el => el.getBoundingClientRect()).filter(r => r.width > 0);
    const overlap = ([x, y]) => rects.reduce((sum, r) => {
      const ox = Math.max(0, Math.min(x + w, r.right + 8) - Math.max(x, r.left - 8));
      const oy = Math.max(0, Math.min(y + h, r.bottom + 8) - Math.max(y, r.top - 8));
      return sum + ox * oy;
    }, 0);
    let best = spots[0], bestO = Infinity;
    for (const spot of spots){
      const o = overlap(spot);
      if (o < bestO){ best = spot; bestO = o; }
      if (o === 0) break;
    }
    coach.style.left = `${Math.max(m, best[0])}px`;
    coach.style.top = `${Math.max(m, best[1])}px`;
  }

  function advance(){
    if (!active) return;
    step++;
    if (step >= STEPS.length) end();
    else render();
  }

  function end(){
    if (!active) return;
    active = false;
    clearFocus();
    coach.classList.add('hidden');
    markDone();
  }

  nextBtn.onclick = advance;
  skipBtn.onclick = end;
  render();

  return {
    get active(){ return active; },
    rivalActive(){ return !active || !!STEPS[step].rival; },
    notify(event, amount = 0){
      if (!active) return;
      const want = STEPS[step].advance;
      if (event === 'moved' && want === 'moved'){
        moved += amount;
        if (moved >= MOVE_NEEDED) advance();
      } else if (event === want){
        advance();
      }
    },
    tick: refreshFocus,
    end,
  };
}
