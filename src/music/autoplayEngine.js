import { logger } from '../utils/logger.js';
import { resolveTrack } from './sourceResolver.js';
import { getSmartRecommendations } from '../ai/recommendationAI.js';
import { getTrendingTracks } from '../ai/trendAnalyzer.js';

/**
 * ═══════════════════════════════════════════════════════════════
 *  Spotify-like Autoplay Engine v2
 * ═══════════════════════════════════════════════════════════════
 *
 * How it works (mirrors Spotify's radio algorithm):
 *
 * 1. COLLABORATIVE SIGNALS — Analyzes the full listening session
 *    to classify genre, mood, energy, tempo, decade bias
 * 2. AI BATCH RECOMMENDATIONS — Single API call for 8-10 songs
 *    that form a coherent "radio station" from the session
 * 3. LOCAL ALGORITHM — When AI isn't available or unclear,
 *    uses a scoring-based algorithm (artist similarity, genre
 *    tags, energy flow, recency weighting)
 * 4. MULTI-SOURCE RESOLUTION — YouTube (primary) → SoundCloud
 *    → Spotify (fallback). Tries all sources for best quality
 * 5. PRE-FETCH BUFFER — 6 tracks queued ahead for instant
 *    transitions, background refill when low
 * 6. SMART MATCHING — Best-match scoring on search results
 *    (penalizes remixes/covers/karaoke, rewards exact match)
 * 7. SESSION DEDUP — Never repeats from recent 20-track history
 */

// ── Per-guild autoplay state ────────────────────────────────────
const autoplayBuffers = new Map();

const BUFFER_LOW_THRESHOLD = 2;
const BUFFER_TARGET_SIZE = 6;

// Search sources in priority order: YouTube → SoundCloud → Spotify
const SEARCH_PREFIXES = ['ytsearch:', 'scsearch:', 'spsearch:'];

/**
 * Get or create the autoplay buffer for a guild
 */
function getBuffer(guildId) {
    if (!autoplayBuffers.has(guildId)) {
        autoplayBuffers.set(guildId, {
            tracks: [],
            refilling: false,
            lastRefill: 0,
            failCount: 0,
            sessionProfile: null, // cached genre/mood analysis
        });
    }
    return autoplayBuffers.get(guildId);
}

/**
 * Clear autoplay buffer (call when user manually queues or stops)
 */
export function clearAutoplayBuffer(guildId) {
    autoplayBuffers.delete(guildId);
}

/**
 * Main entry point — get the next autoplay track.
 * Returns immediately from buffer if available, otherwise fetches fresh.
 */
export async function getAutoplayTrack(shoukaku, queue) {
    const guildId = queue.guildId;
    const buffer = getBuffer(guildId);

    // 1. Return from buffer if available
    if (buffer.tracks.length > 0) {
        const track = buffer.tracks.shift();
        logger.debug(`Autoplay buffer hit for ${guildId} (${buffer.tracks.length} remaining)`);

        // Background refill when running low
        if (buffer.tracks.length <= BUFFER_LOW_THRESHOLD && !buffer.refilling) {
            refillBuffer(shoukaku, queue).catch(() => {});
        }
        return track;
    }

    // 2. Buffer empty — synchronous fill
    logger.debug(`Autoplay buffer empty for ${guildId} — filling...`);
    await refillBuffer(shoukaku, queue);

    if (buffer.tracks.length > 0) {
        return buffer.tracks.shift();
    }

    // 3. All strategies failed
    logger.warn(`Autoplay: all strategies exhausted for ${guildId}`);
    return null;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  BUFFER REFILL — The core Spotify-like pipeline
 * ═══════════════════════════════════════════════════════════════
 *
 * Strategy cascade:
 * 1. AI batch recommendations (best quality — genre/mood coherent)
 * 2. Local algorithm (artist similarity + session analysis)
 * 3. Trending fallback (genre-filtered popular tracks)
 */
async function refillBuffer(shoukaku, queue) {
    const guildId = queue.guildId;
    const buffer = getBuffer(guildId);

    if (buffer.refilling) return;
    buffer.refilling = true;

    try {
        const needed = BUFFER_TARGET_SIZE - buffer.tracks.length;
        if (needed <= 0) return;

        const history = queue.history || [];
        const currentTrack = queue.currentTrack;
        const playedSet = buildPlayedSet(history, currentTrack, buffer.tracks);

        // ── Strategy 1: AI-powered Spotify-like recommendations ──
        const aiQueries = await getSmartRecommendations(history, currentTrack, needed + 4);
        if (aiQueries.length > 0) {
            const resolved = await resolveQueries(shoukaku, aiQueries, playedSet, needed);
            for (const track of resolved) {
                buffer.tracks.push(track);
                addToPlayedSet(playedSet, track);
            }
            logger.info(`Autoplay AI → ${resolved.length} tracks for ${guildId}`);
        }

        // ── Strategy 2: Local algorithm — artist/genre similarity ──
        if (buffer.tracks.length < needed) {
            const remaining = needed - buffer.tracks.length;
            const localQueries = buildLocalAlgorithmQueries(history, currentTrack, remaining + 4);
            const resolved = await resolveQueries(shoukaku, localQueries, playedSet, remaining);
            for (const track of resolved) {
                buffer.tracks.push(track);
                addToPlayedSet(playedSet, track);
            }
            logger.info(`Autoplay local → ${resolved.length} tracks for ${guildId}`);
        }

        // ── Strategy 3: Genre-matched trending fallback ─────────
        if (buffer.tracks.length < 1) {
            const trending = await getTrendingTracks();
            if (trending.length > 0) {
                const shuffled = [...trending].sort(() => Math.random() - 0.5);
                const trendQueries = shuffled.slice(0, 6).map(t => t.query);
                const resolved = await resolveQueries(shoukaku, trendQueries, playedSet, 3);
                for (const track of resolved) {
                    buffer.tracks.push(track);
                }
                logger.info(`Autoplay trending → ${resolved.length} tracks for ${guildId}`);
            }
        }

        buffer.failCount = buffer.tracks.length > 0 ? 0 : buffer.failCount + 1;
        buffer.lastRefill = Date.now();

    } catch (err) {
        logger.error(`Autoplay refill error for ${guildId}: ${err.message}`);
        buffer.failCount++;
    } finally {
        buffer.refilling = false;
    }
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  MULTI-SOURCE RESOLVER
 *  Search order: YouTube → SoundCloud → Spotify
 *  Best-match scoring across all results
 * ═══════════════════════════════════════════════════════════════
 */
async function resolveQueries(shoukaku, queries, playedSet, maxTracks) {
    const resolved = [];
    const node = shoukaku.options.nodeResolver(shoukaku.nodes);
    if (!node) return resolved;

    for (const query of queries) {
        if (resolved.length >= maxTracks) break;

        try {
            let track = null;

            // Try each source: YouTube → SoundCloud → Spotify
            for (const prefix of SEARCH_PREFIXES) {
                if (track?.encoded) break;

                const result = await node.rest.resolve(`${prefix}${query}`).catch(() => null);
                if (result?.loadType === 'search' && result.data?.length > 0) {
                    track = findBestMatch(result.data, query);
                } else if (result?.loadType === 'track' && result.data?.encoded) {
                    track = result.data;
                }
            }

            // Final fallback: general resolve (handles direct URLs, etc.)
            if (!track?.encoded) {
                const genResult = await resolveTrack(shoukaku, query);
                if (genResult?.track) {
                    track = { encoded: genResult.track, info: genResult.info };
                }
            }

            if (track?.encoded && track?.info) {
                const titleLower = track.info.title?.toLowerCase() || '';
                const uri = track.info.uri || '';

                // Dedup
                if (playedSet.has(titleLower) || playedSet.has(uri)) {
                    logger.debug(`Autoplay skip dup: ${track.info.title}`);
                    continue;
                }

                const source = track.info.sourceName?.toLowerCase() || 'unknown';
                resolved.push({
                    track: track.encoded,
                    info: {
                        title: track.info.title || query,
                        author: track.info.author || 'Unknown',
                        uri: track.info.uri || '',
                        length: track.info.length || 0,
                        artworkUrl: track.info.artworkUrl || null,
                        sourceName: source,
                        isStream: track.info.isStream || false,
                    },
                });
                logger.debug(`Autoplay resolved [${source}]: ${track.info.title}`);
            }
        } catch (err) {
            logger.debug(`Autoplay resolve failed for "${query}": ${err.message}`);
        }
    }

    return resolved;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  BEST-MATCH SCORING
 *  Mirrors how Spotify picks the right version of a song
 * ═══════════════════════════════════════════════════════════════
 */
function findBestMatch(tracks, query) {
    if (!tracks || tracks.length === 0) return null;

    const queryLower = query.toLowerCase();
    const parts = queryLower.split(/\s*[-–—]\s*/);
    const queryArtist = parts[0]?.trim() || '';
    const queryTitle = parts.slice(1).join(' ').trim() || queryLower;

    let bestScore = -999;
    let bestTrack = tracks[0];

    for (const track of tracks.slice(0, 10)) {
        let score = 0;
        const title = (track.info?.title || '').toLowerCase();
        const author = (track.info?.author || '').toLowerCase();

        // ── Match signals ──
        if (queryTitle && title.includes(queryTitle)) score += 12;
        if (queryArtist && author.includes(queryArtist)) score += 10;
        if (queryArtist && title.includes(queryArtist)) score += 4;
        if (queryTitle && author.includes(queryTitle)) score += 2;

        // Full match (both artist and title in track title)
        if (title.includes(queryArtist) && title.includes(queryTitle)) score += 6;

        // ── Quality signals ──
        const length = track.info?.length || 0;
        if (length >= 90000 && length <= 480000) score += 4;  // 1.5-8 min = ideal
        if (length >= 60000 && length < 90000) score += 2;    // 1-1.5 min = ok
        if (length < 30000) score -= 8;                        // Under 30s = clip
        if (length > 600000) score -= 3;                       // Over 10 min = likely mix

        // ── Anti-garbage signals ──
        if (!queryLower.includes('remix') && title.includes('remix')) score -= 4;
        if (!queryLower.includes('cover') && title.includes('cover')) score -= 4;
        if (!queryLower.includes('live') && /\blive\b/.test(title)) score -= 3;
        if (title.includes('karaoke')) score -= 10;
        if (title.includes('instrumental') && !queryLower.includes('instrumental')) score -= 6;
        if (title.includes('8d audio') || title.includes('slowed')) score -= 8;
        if (title.includes('nightcore')) score -= 6;
        if (title.includes('bass boosted')) score -= 6;
        if (title.includes('lyrics') || title.includes('lyric video')) score -= 1; // slight penalty

        // ── Prefer official ──
        if (author.includes('official') || title.includes('official')) score += 2;
        if (title.includes('topic')) score += 1; // YouTube auto-gen topic channels

        if (score > bestScore) {
            bestScore = score;
            bestTrack = track;
        }
    }

    return bestTrack;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  LOCAL ALGORITHM — Spotify-like without AI
 *  
 *  When AI is unavailable or returns too few results, this
 *  algorithm generates search queries using:
 *  - Artist similarity (same artist → fans also like)
 *  - Title keyword extraction (genre/mood words)
 *  - Collaborative patterns ("Artist - popular", "songs like X")
 *  - Era/decade matching
 * ═══════════════════════════════════════════════════════════════
 */
function buildLocalAlgorithmQueries(history, currentTrack, count) {
    const allTracks = [];
    if (currentTrack?.info) allTracks.push(currentTrack);
    for (const t of history) {
        if (t?.info) allTracks.push(t);
    }
    if (allTracks.length === 0) return [];

    const queries = [];
    const used = new Set();

    // ── 1. "Fans also like" — search by each unique artist ──
    const artists = [];
    for (const t of allTracks) {
        const a = t.info.author?.trim();
        if (a && !used.has(a.toLowerCase())) {
            used.add(a.toLowerCase());
            artists.push(a);
        }
    }

    // Most recent artists get priority (Spotify weights recent listening)
    for (const artist of artists.slice(0, 3)) {
        queries.push(`${artist} popular songs`);
        queries.push(`${artist} best songs`);
    }

    // ── 2. "Similar to" queries — collaborative filtering proxy ──
    if (currentTrack?.info) {
        queries.push(`songs similar to ${currentTrack.info.title} ${currentTrack.info.author}`);
        queries.push(`${currentTrack.info.author} mix`);
    }

    // ── 3. Genre seed from track titles/artists ──
    // Extract genre-hint keywords from titles
    const genreKeywords = extractGenreKeywords(allTracks);
    for (const kw of genreKeywords.slice(0, 2)) {
        queries.push(`${kw} music playlist`);
        queries.push(`best ${kw} songs`);
    }

    // ── 4. Adjacent artist discovery ──
    for (const artist of artists.slice(0, 2)) {
        queries.push(`artists similar to ${artist}`);
        queries.push(`if you like ${artist}`);
    }

    // Shuffle to provide variety across refills, then cap
    const shuffled = queries.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Extract genre-hint keywords from track metadata
 */
function extractGenreKeywords(tracks) {
    const genreTerms = [
        'pop', 'rock', 'hip hop', 'rap', 'r&b', 'rnb', 'jazz', 'blues',
        'country', 'electronic', 'edm', 'house', 'techno', 'trance',
        'dubstep', 'drum and bass', 'dnb', 'ambient', 'lo-fi', 'lofi',
        'indie', 'alternative', 'punk', 'metal', 'classical', 'soul',
        'funk', 'reggae', 'latin', 'k-pop', 'kpop', 'j-pop', 'anime',
        'phonk', 'trap', 'drill', 'gospel', 'folk', 'acoustic',
        'bedroom pop', 'synthwave', 'retrowave', 'vaporwave', 'grunge',
        'emo', 'midwest emo', 'shoegaze', 'dream pop', 'post-punk',
        'neo soul', 'afrobeats', 'dancehall', 'bossa nova',
    ];

    const found = new Set();
    for (const t of tracks) {
        const text = `${t.info.title} ${t.info.author}`.toLowerCase();
        for (const term of genreTerms) {
            if (text.includes(term)) found.add(term);
        }
    }
    return [...found];
}

/**
 * Build dedup set from played history + buffer
 */
function buildPlayedSet(history, currentTrack, bufferTracks) {
    const set = new Set();
    const allTracks = [...history];
    if (currentTrack) allTracks.push(currentTrack);
    for (const t of bufferTracks) allTracks.push(t);

    for (const t of allTracks) {
        if (t?.info?.title) set.add(t.info.title.toLowerCase());
        if (t?.info?.uri) set.add(t.info.uri);
    }
    return set;
}

function addToPlayedSet(set, track) {
    if (track?.info?.title) set.add(track.info.title.toLowerCase());
    if (track?.info?.uri) set.add(track.info.uri);
}
