/**
 * Game Data Schema and Normalization
 * Ensures strict fallback to 'Not provided' for missing title, author, or description.
 */

export function normalizeGame(raw, defaultSource = 'Not provided') {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  // Fallback to 'Not provided' for required fields
  const title = (raw.name || raw.title)?.toString().trim() || 'Not provided';
  const author = (raw.author || raw.creator)?.toString().trim() || 'Not provided';
  const description = (raw.description || raw.desc || raw.about)?.toString().trim() || 'Not provided';
  const source = (raw.source || defaultSource)?.toString().trim() || 'Not provided';

  // Link normalization
  const sourceUrl = raw.sourceUrl || raw.authorLink || raw.originalUrl || 'Not provided';
  const embedUrl = raw.embedUrl || raw.url || '';
  const thumbnailUrl = raw.thumbnailUrl || raw.cover || '/assets/placeholders/default-game.svg';
  
  // Clean unique ID
  const id = raw.id !== undefined && raw.id !== null ? String(raw.id) : `game_${Math.random().toString(36).substring(2, 9)}`;

  return {
    id,
    title,
    author,
    description,
    source,
    sourceUrl,
    embedUrl,
    thumbnailUrl,
    fallbackThumbnail: raw.fallbackThumbnail || '/assets/placeholders/default-game.svg',
    aspectRatio: raw.aspectRatio || '16:9',
    special: Array.isArray(raw.special) ? raw.special : [],
    mirrors: Array.isArray(raw.mirrors) ? raw.mirrors : [],
    controls: (raw.controls || '')?.toString().trim() || null,
    supportsAboutBlank: raw.supportsAboutBlank !== false,
    directEmbed: raw.directEmbed === true,
    rawId: raw.rawId || null,
    image_token: raw.image_token || raw.imageToken || null
  };
}
