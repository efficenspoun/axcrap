const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'public', 'assets', 'placeholders');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const games = [
  { file: 'default-game.svg', title: 'ARCADE', icon: '🎮' },
  { file: '2048.svg', title: '2048', icon: '2048' },
  { file: 'hextris.svg', title: 'HEXTRIS', icon: '⬢' },
  { file: 'clumsy-bird.svg', title: 'CLUMSY BIRD', icon: '🐦' },
  { file: 'pacman.svg', title: 'PACMAN', icon: 'ᗧ' },
  { file: 'tower.svg', title: 'TOWER GAME', icon: '🗼' },
  { file: 'duckhunt.svg', title: 'DUCK HUNT', icon: '🎯' },
  { file: 'connect4.svg', title: 'CONNECT 4', icon: '⚪' },
  { file: 'minesweeper.svg', title: 'MINESWEEPER', icon: '🚩' },
  { file: 'tetris.svg', title: 'TETRIS', icon: '🧱' },
  { file: 'darkroom.svg', title: 'A DARK ROOM', icon: '🕯' },
  { file: 'asteroids.svg', title: 'ASTEROIDS', icon: '✦' },
  { file: 'breakout.svg', title: 'BREAKOUT', icon: '═' }
];

games.forEach(g => {
  const isTextIcon = g.icon.length > 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
  <rect width="600" height="400" fill="#121215"/>
  <rect x="1" y="1" width="598" height="398" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>
  <circle cx="300" cy="175" r="54" fill="#18181c" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
  <text x="300" y="${isTextIcon ? '184' : '187'}" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="${isTextIcon ? '22' : '36'}" font-weight="600" fill="#e4e4e7">${g.icon}</text>
  <text x="300" y="270" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-weight="600" font-size="16" letter-spacing="3" fill="#71717a">${g.title}</text>
</svg>`;
  fs.writeFileSync(path.join(outDir, g.file), svg, 'utf-8');
});

console.log('Successfully created', games.length, 'minimalist placeholders');
