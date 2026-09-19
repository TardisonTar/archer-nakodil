'use strict';

// Первый уровень заканчивается после 10 линий. Бесконечный режим ускоряется.
const COLS = 10, ROWS = 20, CELL = 30;
const LEVEL = { target: 10, fallMs: 800 };
const ENDLESS = { linesPerStage: 10, speedFactor: 0.85, minFallMs: 100, maxStage: 14 };
const MODES = {
  level1: { name: 'Уровень 1', tag: 'УРОВЕНЬ 01', intro: 'Собери 10 линий и пройди первый уровень' },
  endless: { name: 'Бесконечный режим', tag: 'БЕСКОНЕЧНЫЙ ∞', intro: 'Собирай линии, набирай очки и держи темп' }
};
const COLORS = ['', '#61d9ef', '#6298ff', '#ffb363', '#ffe175', '#83e5b1', '#be99ff', '#ff8498'];
const SHAPES = [
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,0,0],[2,2,2],[0,0,0]],                   // J
  [[0,0,3],[3,3,3],[0,0,0]],                   // L
  [[4,4],[4,4]],                               // O
  [[0,5,5],[5,5,0],[0,0,0]],                   // S
  [[0,6,0],[6,6,6],[0,0,0]],                   // T
  [[7,7,0],[0,7,7],[0,0,0]]                    // Z
];
const $ = id => document.getElementById(id);
const ctx = $('board').getContext('2d');
const nextCtx = $('next').getContext('2d');
let board, piece, nextPiece, bag, score, lines;
let mode = 'level1', state = 'menu', savedState = null, elapsed = 0, lastTime = 0;
const RECORDS_KEY = 'tetris.leaderboard.v1', PLAYER_KEY = 'tetris.player.v1';
let records = [], leaderboardMode = 'level1', activePlayer = 'Игрок';
let recordedRun = false, lastRunId = null, storageAvailable = true;

function cleanName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24) || 'Игрок';
}

function sortedResults(selectedMode, source = records) {
  return source.filter(entry => entry.mode === selectedMode)
    .sort((a, b) => b.score - a.score || b.lines - a.lines || a.date - b.date || a.id.localeCompare(b.id))
    .slice(0, 10);
}

// Проверяем сохранённые данные: повреждённая запись не должна мешать запуску игры.
function readRecords() {
  let raw;
  try { raw = localStorage.getItem(RECORDS_KEY); }
  catch { storageAvailable = false; return []; }
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry && typeof entry.id === 'string' && entry.id.length <= 100 &&
      Object.hasOwn(MODES, entry.mode) && typeof entry.name === 'string' &&
      Number.isSafeInteger(entry.score) && entry.score >= 0 &&
      Number.isSafeInteger(entry.lines) && entry.lines >= 0 &&
      Number.isSafeInteger(entry.date) && entry.date >= 0 && entry.date <= 8640000000000000 &&
      typeof entry.won === 'boolean').map(entry => ({...entry, name: cleanName(entry.name)}));
  } catch { return []; }
}

function mergedRecords(...sources) {
  const unique = [...new Map(sources.flat().map(entry => [entry.id, entry])).values()];
  return [...sortedResults('level1', unique), ...sortedResults('endless', unique)];
}

function renderLeaderboard() {
  $('leaders-level').setAttribute('aria-pressed', String(leaderboardMode === 'level1'));
  $('leaders-endless').setAttribute('aria-pressed', String(leaderboardMode === 'endless'));
  $('leaderboard-caption').textContent = `${MODES[leaderboardMode].name} · 10 лучших результатов`;
  $('leaderboard-note').textContent = storageAvailable
    ? '10 лучших завершённых игр в каждом режиме. Результаты сохраняются только в этом браузере.'
    : 'Браузер не разрешает сохранять рекорды. Таблица работает до закрытия или обновления этой страницы.';
  const entries = sortedResults(leaderboardMode);
  const rows = entries.map((entry, index) => {
    const row = document.createElement('tr');
    if (entry.id === lastRunId) row.className = 'latest-result';
    const rank = document.createElement('td'); rank.textContent = index + 1;
    const player = document.createElement('td');
    const name = document.createElement('span'); name.className = 'record-name'; name.textContent = entry.name;
    const detail = document.createElement('span'); detail.className = 'record-detail';
    detail.textContent = entry.id === lastRunId ? 'Последняя игра' : entry.won ? 'Уровень пройден' : 'Игра окончена';
    player.append(name, detail);
    const points = document.createElement('td'); points.textContent = entry.score.toLocaleString('ru-RU');
    const cleared = document.createElement('td'); cleared.textContent = entry.lines;
    const date = document.createElement('td'); date.className = 'record-date';
    date.textContent = new Date(entry.date).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: '2-digit'});
    row.append(rank, player, points, cleared, date);
    return row;
  });
  if (!rows.length) {
    const row = document.createElement('tr'), cell = document.createElement('td');
    cell.colSpan = 5; cell.className = 'empty-results'; cell.textContent = 'Здесь пока пусто. Заверши первую игру!';
    row.append(cell); rows.push(row);
  }
  // Имена вставляются как текст, а не HTML.
  $('leaderboard-rows').replaceChildren(...rows);
  $('leaders-resume').hidden = savedState !== 'paused';
}

function showLeaderboard() {
  if (state !== 'menu') openMenu();
  leaderboardMode = mode;
  records = mergedRecords(records, readRecords());
  renderLeaderboard();
  $('leaderboard-heading').focus({preventScroll: true});
  $('leaderboard').scrollIntoView({block: 'start'});
}

function saveResult(won) {
  if (recordedRun) return;
  recordedRun = true;
  const entry = {id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    mode, name: activePlayer, score, lines, won, date: Date.now()};
  lastRunId = entry.id;
  records = mergedRecords(records, readRecords(), [entry]);
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); storageAvailable = true; }
  catch { storageAvailable = false; }
  const rank = sortedResults(mode).findIndex(result => result.id === entry.id) + 1;
  $('result-note').textContent = rank
    ? `Место в таблице: ${rank}${storageAvailable ? ' · Результат сохранён' : ' · Только в этом сеансе'}`
    : 'Результат вне первой десятки. Попробуй ещё!';
  leaderboardMode = mode;
  renderLeaderboard();
  updateStats();
}

function loadLeaderboard() {
  records = mergedRecords(readRecords());
  try { $('player-name').value = cleanName(localStorage.getItem(PLAYER_KEY)); }
  catch { storageAvailable = false; $('player-name').value = 'Игрок'; }
  renderLeaderboard();
}

function speedStage() {
  return mode === 'endless' ? Math.min(ENDLESS.maxStage, Math.floor(lines / ENDLESS.linesPerStage) + 1) : 1;
}

function fallInterval() {
  return mode === 'endless'
    ? Math.max(ENDLESS.minFallMs, Math.round(LEVEL.fallMs * ENDLESS.speedFactor ** (speedStage() - 1)))
    : LEVEL.fallMs;
}

// «Мешок» из семи фигур: каждая встречается один раз за цикл.
function takeShape() {
  if (!bag.length) {
    bag = SHAPES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return SHAPES[bag.pop()].map(row => row.slice());
}

function collides(matrix, x, y) {
  return matrix.some((row, dy) => row.some((value, dx) => {
    if (!value) return false;
    const bx = x + dx, by = y + dy;
    return bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board[by][bx] !== 0);
  }));
}

function spawn() {
  piece = { matrix: nextPiece, x: Math.floor((COLS - nextPiece.length) / 2), y: 0 };
  nextPiece = takeShape();
  drawNext();
  if (collides(piece.matrix, piece.x, piece.y)) finish(false);
}

function start(selectedMode = mode) {
  if (!Object.hasOwn(MODES, selectedMode)) return;
  mode = selectedMode; savedState = null;
  activePlayer = cleanName($('player-name').value);
  $('player-name').value = activePlayer;
  recordedRun = false;
  try { localStorage.setItem(PLAYER_KEY, activePlayer); } catch { storageAvailable = false; }
  $('game-player').textContent = activePlayer;
  board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
  bag = []; score = 0; lines = 0; elapsed = 0;
  state = 'playing'; nextPiece = takeShape();
  spawn(); updateStats(); syncScreen();
  $('status').textContent = mode === 'level1' ? 'Игра началась. Соберите 10 линий.' : 'Бесконечная игра началась. Ускорение каждые 10 линий.';
  lastTime = performance.now();
  draw();
  $('board').focus({preventScroll: true});
  $('game-screen').scrollIntoView({block: 'start'});
}

// Возврат в меню приостанавливает текущую игру; можно продолжить её без сброса.
function openMenu() {
  if (state === 'menu') return;
  savedState = ['playing', 'paused'].includes(state) ? 'paused' : null;
  state = 'menu';
  syncScreen();
  $('status').textContent = savedState ? 'Главное меню. Текущая игра приостановлена.' : 'Главное меню. Выберите режим.';
  $('menu-heading').focus({preventScroll: true});
}

function resumeGame() {
  if (state !== 'menu' || savedState !== 'paused') return;
  state = 'playing'; savedState = null; lastTime = performance.now();
  syncScreen(); draw();
  $('status').textContent = 'Игра продолжается.';
  $('board').focus({preventScroll: true});
  $('game-screen').scrollIntoView({block: 'start'});
}

function syncScreen() {
  const inMenu = state === 'menu';
  $('menu').hidden = !inMenu;
  $('game-screen').hidden = inMenu;
  $('intro').textContent = inMenu ? 'Два режима. Один любимый Тетрис.' : MODES[mode].intro;
  $('mode-tag').textContent = inMenu ? 'ГЛАВНОЕ МЕНЮ' : MODES[mode].tag;
  $('resume').hidden = !inMenu || savedState !== 'paused';
  $('resume').textContent = `Продолжить: ${MODES[mode].name}`;
  if (inMenu) renderLeaderboard();
  syncOverlay();
}

function move(dx) {
  if (!collides(piece.matrix, piece.x + dx, piece.y)) piece.x += dx;
}

function rotate() {
  const m = piece.matrix;
  const rotated = m[0].map((_, x) => m.map(row => row[x]).reverse());
  // Простой сдвиг от стен, если поворот на месте невозможен.
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(rotated, piece.x + dx, piece.y)) {
      piece.matrix = rotated; piece.x += dx; return;
    }
  }
}

function down(manual = false) {
  if (!collides(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
    if (manual) { score++; updateStats(); }
  } else lock();
  elapsed = 0;
}

function hardDrop() {
  while (!collides(piece.matrix, piece.x, piece.y + 1)) { piece.y++; score += 2; }
  lock(); elapsed = 0;
}

function lock() {
  // Защита от фиксации фигуры выше верхней границы.
  if (piece.matrix.some((row, dy) => row.some(v => v && piece.y + dy < 0))) {
    finish(false); return;
  }
  piece.matrix.forEach((row, dy) => row.forEach((v, dx) => {
    if (v) board[piece.y + dy][piece.x + dx] = v;
  }));
  const kept = board.filter(row => row.some(cell => cell === 0));
  const cleared = ROWS - kept.length;
  board = [...Array.from({length: cleared}, () => Array(COLS).fill(0)), ...kept];
  // Очки за линии умножаются на скорость до текущего удаления рядов.
  score += [0, 100, 300, 500, 800][cleared] * speedStage();
  lines += cleared;
  updateStats();
  if (cleared) $('status').textContent = mode === 'level1'
    ? `Линий: ${lines} из ${LEVEL.target}. Счёт: ${score}.`
    : `Линий: ${lines}. Скорость: ${speedStage()}. Счёт: ${score}.`;
  if (mode === 'level1' && lines >= LEVEL.target) finish(true);
  else spawn();
}

function updateStats() {
  const endless = mode === 'endless';
  const maxSpeed = endless && speedStage() === ENDLESS.maxStage;
  const remaining = endless ? ENDLESS.linesPerStage - lines % ENDLESS.linesPerStage : Math.max(0, LEVEL.target - lines);
  $('score').textContent = score.toLocaleString('ru-RU');
  $('best-score').textContent = (sortedResults(mode)[0]?.score || 0).toLocaleString('ru-RU');
  $('lines').textContent = lines;
  $('line-target').hidden = endless;
  $('speed-row').hidden = !endless;
  $('speed-stage').textContent = speedStage();
  $('progress').max = endless ? ENDLESS.linesPerStage : LEVEL.target;
  $('progress').hidden = maxSpeed;
  $('progress').value = endless ? lines % ENDLESS.linesPerStage : Math.min(lines, LEVEL.target);
  $('progress').setAttribute('aria-label', endless ? 'Линии до следующей скорости' : 'Пройдено линий из 10');
  $('progress-note').textContent = maxSpeed ? 'Максимальная скорость' : endless ? `До следующей скорости: ${remaining}` : `До победы: ${remaining}`;
  const seconds = (fallInterval() / 1000).toLocaleString('ru-RU', {maximumFractionDigits: 3});
  $('game-footer').textContent = `${MODES[mode].name} · Одна клетка за ${seconds} с · Контур показывает место падения`;
}

function finish(won) {
  if (state !== 'playing') return;
  state = won ? 'won' : 'lost';
  saveResult(won);
  syncOverlay();
  $('status').textContent = `${won ? 'Уровень пройден!' : 'Игра окончена.'} Счёт: ${score}.`;
  $('main-action').focus({preventScroll: true});
}

function pause() {
  if (state !== 'playing' && state !== 'paused') return;
  state = state === 'playing' ? 'paused' : 'playing';
  lastTime = performance.now();
  syncOverlay();
  $('status').textContent = state === 'paused' ? 'Пауза.' : 'Игра продолжается.';
  $(state === 'paused' ? 'main-action' : 'board').focus({preventScroll: true});
}

function syncOverlay() {
  $('overlay').hidden = state === 'playing' || state === 'menu';
  const finished = state === 'won' || state === 'lost';
  $('result-note').hidden = !finished;
  $('result-leaders').hidden = !finished;
  $('pause').disabled = !['playing', 'paused'].includes(state);
  $('pause').textContent = state === 'paused' ? 'Продолжить' : 'Пауза';
  if (state === 'playing' || state === 'menu') return;
  const paused = state === 'paused', won = state === 'won';
  $('symbol').textContent = paused ? 'Ⅱ' : won ? '✦' : '↻';
  $('title').textContent = paused ? 'Пауза' : won ? 'Уровень пройден!' : 'Игра окончена';
  $('message').textContent = paused ? 'Игра ждёт. Продолжай, когда будешь готов.' :
    won ? `Цель достигнута! Линий: ${lines}. Счёт: ${score}.` :
    mode === 'endless' ? `Линий: ${lines}. Скорость: ${speedStage()}. Счёт: ${score}. Попробуем ещё?` :
    `Поле заполнено. Линий: ${lines} из ${LEVEL.target}. Счёт: ${score}.`;
  $('main-action').textContent = paused ? 'Продолжить' : 'Играть ещё';
}

function block(context, x, y, size, color, ghost = false) {
  if (ghost) {
    context.strokeStyle = color;
    context.globalAlpha = .48;
    context.lineWidth = 1.5;
    context.strokeRect(x + 3, y + 3, size - 6, size - 6);
    context.globalAlpha = 1;
    return;
  }
  context.fillStyle = color;
  context.fillRect(x + 1, y + 1, size - 2, size - 2);
  context.fillStyle = '#ffffff40';
  context.fillRect(x + 3, y + 3, size - 6, 3);
  context.fillStyle = '#00000025';
  context.fillRect(x + 3, y + size - 6, size - 6, 3);
}

function drawPiece(atY, ghost = false) {
  piece.matrix.forEach((row, dy) => row.forEach((v, dx) => {
    if (v) block(ctx, (piece.x + dx) * CELL, (atY + dy) * CELL, CELL, COLORS[v], ghost);
  }));
}

function draw() {
  ctx.fillStyle = '#0b111e'; ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
  ctx.strokeStyle = '#1b2435'; ctx.lineWidth = .5;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, ROWS * CELL); ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(COLS * CELL, y * CELL); ctx.stroke();
  }
  if (!board) return;
  board.forEach((row, y) => row.forEach((v, x) => {
    if (v) block(ctx, x * CELL, y * CELL, CELL, COLORS[v]);
  }));
  if (piece && ['playing', 'paused'].includes(state)) {
    let ghostY = piece.y;
    while (!collides(piece.matrix, piece.x, ghostY + 1)) ghostY++;
    drawPiece(ghostY, true); drawPiece(piece.y);
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, 120, 100);
  const cells = [];
  nextPiece.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push({x, y, v}); }));
  const minX = Math.min(...cells.map(c => c.x)), maxX = Math.max(...cells.map(c => c.x));
  const minY = Math.min(...cells.map(c => c.y)), maxY = Math.max(...cells.map(c => c.y));
  const size = 24, ox = (120 - (maxX - minX + 1) * size) / 2, oy = (100 - (maxY - minY + 1) * size) / 2;
  cells.forEach(c => block(nextCtx, ox + (c.x - minX) * size, oy + (c.y - minY) * size, size, COLORS[c.v]));
}

function act(action) {
  if (state !== 'playing') return;
  if (action === 'left') move(-1);
  if (action === 'right') move(1);
  if (action === 'rotate') rotate();
  if (action === 'down') down(true);
  if (action === 'drop') hardDrop();
  draw();
}

const keys = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', Space: 'drop'};
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target?.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (event.code === 'KeyP' || event.code === 'Escape') {
    event.preventDefault(); if (!event.repeat) pause(); return;
  }
  const action = keys[event.code];
  if (!action || state !== 'playing') return;
  event.preventDefault();
  if (event.repeat && ['rotate', 'drop'].includes(action)) return;
  act(action);
});
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => act(button.dataset.action));
});
$('main-action').addEventListener('click', () => state === 'paused' ? pause() : start());
$('restart').addEventListener('click', () => start());
$('pause').addEventListener('click', pause);
$('choose-level').addEventListener('click', () => start('level1'));
$('choose-endless').addEventListener('click', () => start('endless'));
$('menu-button').addEventListener('click', openMenu);
$('overlay-menu').addEventListener('click', openMenu);
$('resume').addEventListener('click', resumeGame);
$('leaders-resume').addEventListener('click', resumeGame);
$('menu-leaders').addEventListener('click', showLeaderboard);
$('game-leaders').addEventListener('click', showLeaderboard);
$('result-leaders').addEventListener('click', showLeaderboard);
$('leaders-level').addEventListener('click', () => { leaderboardMode = 'level1'; renderLeaderboard(); });
$('leaders-endless').addEventListener('click', () => { leaderboardMode = 'endless'; renderLeaderboard(); });
window.addEventListener('storage', event => {
  if (event.key !== RECORDS_KEY && event.key !== null) return;
  records = mergedRecords(records, readRecords());
  renderLeaderboard();
  if (board) updateStats();
});
window.addEventListener('blur', () => { if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });

function frame(time) {
  const delta = Math.min(time - lastTime, 1000);
  lastTime = time;
  if (state === 'playing') {
    elapsed += delta;
    if (elapsed >= fallInterval()) { down(); draw(); }
  }
  requestAnimationFrame(frame);
}
loadLeaderboard(); syncScreen(); draw();
requestAnimationFrame(frame);
