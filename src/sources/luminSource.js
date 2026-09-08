import { normalizeGame } from './schema.js';

let luminInitialized = false;
let luminInitPromise = null;

function isFileProtocol() {
  return typeof location !== 'undefined' && location.protocol === 'file:';
}

async function ensureLuminInitialized() {
  if (luminInitialized) return;
  if (luminInitPromise) return luminInitPromise;

  luminInitPromise = (async () => {
    if (typeof Lumin === 'undefined') {
      throw new Error('LuminSDK not loaded. Ensure the script tag is present in index.html');
    }

    // Lumin is a live SDK, not a static catalog.  Keep it enabled on normal
    // http(s) deployments, but don't let a local single-file page hang or
    // fail its entire catalog because the SDK cannot initialize under file://.
    if (isFileProtocol()) {
      throw new Error('LuminSDK live catalog is unavailable in file:// mode');
    }

    await Lumin.init({ headless: true });
    luminInitialized = true;
  })();

  luminInitPromise = luminInitPromise.catch((err) => {
    luminInitPromise = null;
    luminInitialized = false;
    throw err;
  });

  return luminInitPromise;
}

function stripPrefix(gameId) {
  if (typeof gameId === 'string' && gameId.startsWith('lumin_')) {
    return gameId.slice('lumin_'.length);
  }
  return gameId;
}

const LUMIN_IMAGE_BASE = 'https://a.luminsdk.com/api/v1/icon';

function convertLuminGame(game) {
  const imageUrl = game.image_token
    ? `${LUMIN_IMAGE_BASE}/${game.image_token}`
    : null;

  return normalizeGame({
    id: `lumin_${game.id}`,
    name: game.name,
    author: 'Not provided',
    description: `Play ${game.name} - a browser game from LuminSDK`,
    source: 'LuminSDK',
    sourceUrl: 'https://luminsdk.com',
    url: null,
    cover: imageUrl,
    fallbackThumbnail: '/assets/placeholders/default-game.svg',
    special: game.category ? [game.category] : [],
    image_token: game.image_token,
    rawId: game.id
  }, 'LuminSDK');
}

const PAGE_SIZE = 500;

export const luminSource = {
  id: 'luminsdk',
  name: 'LuminSDK',
  homepage: 'https://luminsdk.com',

  async scrape() {
    await ensureLuminInitialized();

    const allRaw = [];
    let page = 1;

    while (true) {
      const result = await Lumin.getGames({ page, limit: PAGE_SIZE, q: '' });
      const batch = result.games || [];
      allRaw.push(...batch);

      if (page >= (result.pages || 1) || allRaw.length >= (result.total || allRaw.length)) {
        break;
      }
      page += 1;
    }

    return allRaw.map(convertLuminGame).filter(Boolean);
  },

  getImageUrl(imageToken) {
    if (!imageToken) return null;
    return `${LUMIN_IMAGE_BASE}/${imageToken}`;
  },

  async loadGame(gameId) {
    await ensureLuminInitialized();
    return Lumin.loadGame(stripPrefix(gameId));
  },

  async getGameUrl(gameId) {
    await ensureLuminInitialized();
    return Lumin.getGameUrl(stripPrefix(gameId));
  },

  async search(query) {
    await ensureLuminInitialized();
    return Lumin.search(query);
  },

  async getCategories() {
    await ensureLuminInitialized();
    return Lumin.getCategories();
  },

  async getRandomGames(count = 12) {
    await ensureLuminInitialized();
    return Lumin.getRandomGames(count);
  }
};
