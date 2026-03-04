import OpenAI from 'openai';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let openai = null;

function getClient() {
    if (!openai && config.aiApiKey) {
        openai = new OpenAI({ apiKey: config.aiApiKey });
    }
    return openai;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  Spotify-Grade AI Recommendation Engine
 * ═══════════════════════════════════════════════════════════════
 *
 * Mirrors Spotify's recommendation pipeline:
 * 1. Session profiling — genre, mood, energy, tempo, era
 * 2. Collaborative filtering — "listeners who played X also play Y"
 * 3. Content-based filtering — same subgenre, similar BPM, mood
 * 4. Exploration vs exploitation — 60% safe / 30% discover / 10% deep
 * 5. Anti-repetition — artist cooldown, no repeats
 */

/**
 * Build a structured listening profile from history.
 * This is the "seed" that drives all recommendations, like Spotify's taste profile.
 */
function buildListeningProfile(history, currentTrack) {
    const tracks = [];
    if (currentTrack?.info) tracks.push(currentTrack);
    for (const t of history) {
        if (t?.info) tracks.push(t);
    }
    if (tracks.length === 0) return null;

    const artists = [];
    const artistCounts = {};
    const titles = [];

    for (const t of tracks) {
        const artist = t.info.author;
        if (artist) {
            if (!artistCounts[artist]) {
                artists.push(artist);
                artistCounts[artist] = 0;
            }
            artistCounts[artist]++;
        }
        titles.push(`"${t.info.title}" by ${t.info.author}`);
    }

    // Over-represented = heard 2+ songs from same artist
    const overRepresented = Object.entries(artistCounts)
        .filter(([, c]) => c >= 2)
        .map(([a]) => a);

    return {
        artists,
        artistCounts,
        overRepresented,
        titles,
        trackCount: tracks.length,
        // Recent bias — Spotify weights the last few tracks more
        recentArtists: artists.slice(0, 3),
        recentTitles: titles.slice(0, 5),
    };
}

/**
 * Main recommendation function — Spotify-quality AI recommendations.
 *
 * Pipeline:
 * 1. Build listening profile from session
 * 2. If AI available → use AI with Spotify-grade prompt
 * 3. If AI unavailable/unclear → use local collaborative algorithm
 * 4. Always return "Artist - Song Title" format for multi-source resolution
 */
export async function getSmartRecommendations(history, currentTrack, count = 8) {
    const profile = buildListeningProfile(history, currentTrack);
    if (!profile) return [];

    const client = getClient();

    // AI available → use Spotify-grade prompt
    if (client) {
        try {
            const aiResults = await getAIRecommendations(client, profile, count);
            if (aiResults.length >= Math.ceil(count / 2)) {
                return aiResults;
            }
            // AI returned too few — supplement with local algorithm
            const localResults = getLocalRecommendations(profile, count - aiResults.length);
            return [...aiResults, ...localResults].slice(0, count);
        } catch (err) {
            logger.debug(`AI recommendation failed, using local: ${err.message}`);
        }
    }

    // No AI → local collaborative algorithm
    return getLocalRecommendations(profile, count);
}

/**
 * AI-powered recommendations with Spotify-grade prompt engineering
 */
async function getAIRecommendations(client, profile, count) {
    const playedTitles = profile.titles.slice(-20);

    const prompt = `You are Spotify's recommendation algorithm. Analyze this listening session and generate a perfect radio queue that flows seamlessly, as if the user pressed "Song Radio" on Spotify.

## Current listening session (most recent first):
${playedTitles.join('\n')}

## Your analysis process (do silently):
1. Identify the EXACT subgenre (e.g. "midwest emo" not "rock", "dark trap" not "rap", "bedroom pop" not "pop", "progressive house" not "EDM")
2. Determine the MOOD (melancholic, euphoric, chill, hype, dreamy, dark, uplifting, nostalgic...)
3. Gauge the ENERGY level (1-10) and whether it's trending up, down, or steady
4. Note the ERA preference (2020s, 2010s, 2000s, classic, mixed)

## Generate exactly ${count} song recommendations:
- RULE #1: Same specific subgenre — this is NON-NEGOTIABLE
- RULE #2: Match the mood and energy precisely (±1 on energy scale)
- RULE #3: Natural flow — each song should feel like "of course that plays next"
- RULE #4: All songs must be REAL, by REAL artists, available on YouTube/Spotify/SoundCloud
- MIX: ~60% songs by similar well-known artists in the same scene, ~30% adjacent artists the listener would discover and love, ~10% deeper cuts that perfectly fit the vibe
${profile.overRepresented.length > 0 ? `- COOLDOWN: Do NOT recommend songs by ${profile.overRepresented.join(', ')} (listener has heard enough)` : ''}
- NEVER include any song already in the session above
- Prefer songs with high streaming counts (easier to find on all platforms)

## OUTPUT (strict JSON, nothing else):
["Artist - Song Title", "Artist - Song Title", ...]`;

    const response = await client.chat.completions.create({
        model: config.aiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.45,
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return [];

    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    // Filter: valid strings, not already played
    const playedLower = new Set(playedTitles.map(t => t.toLowerCase()));
    const cleaned = parsed
        .filter(s => typeof s === 'string' && s.length > 3 && s.length < 200)
        .filter(s => {
            const lower = s.toLowerCase();
            const songPart = lower.split(/\s*[-–—]\s*/).slice(1).join(' ').trim();
            return !playedLower.has(lower) &&
                   !playedTitles.some(p => songPart && p.toLowerCase().includes(songPart));
        })
        .slice(0, count);

    if (cleaned.length > 0) {
        logger.info(`AI recommends ${cleaned.length}: ${cleaned.slice(0, 3).join(', ')}...`);
    }
    return cleaned;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  LOCAL COLLABORATIVE ALGORITHM (No AI needed)
 *
 *  Generates high-quality search queries using collaborative
 *  filtering patterns, artist similarity, and session analysis.
 *  This runs when AI is unavailable or returns too few results.
 * ═══════════════════════════════════════════════════════════════
 */
function getLocalRecommendations(profile, count) {
    if (!profile || profile.artists.length === 0) return [];

    const queries = [];
    const used = new Set();

    function addQuery(q) {
        const key = q.toLowerCase();
        if (!used.has(key)) {
            used.add(key);
            queries.push(q);
        }
    }

    // ── Collaborative: "fans also like" patterns ──
    for (const artist of profile.recentArtists.slice(0, 3)) {
        addQuery(`${artist} top tracks`);
        addQuery(`${artist} best songs`);
    }

    // ── Content-based: "similar to current song" ──
    for (const title of profile.recentTitles.slice(0, 2)) {
        const clean = title.replace(/"/g, '').replace(/\s+by\s+.+$/, '');
        addQuery(`songs like ${clean}`);
    }

    // ── Artist similarity chains ──
    for (const artist of profile.artists.slice(0, 4)) {
        addQuery(`${artist} radio`);
    }

    // ── Discovery: adjacent artists ──
    if (profile.artists[0]) {
        addQuery(`artists similar to ${profile.artists[0]}`);
        addQuery(`if you like ${profile.artists[0]} playlist`);
    }

    // Shuffle for variety
    const shuffled = queries.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// ── Legacy exports for backward compatibility ──────────────────
export async function getRecommendations(history, currentTrack) {
    const results = await getSmartRecommendations(history, currentTrack, 1);
    return results[0] || null;
}

export async function getMultipleRecommendations(history, currentTrack, count = 5) {
    return getSmartRecommendations(history, currentTrack, count);
}
