import { logger } from '../utils/logger.js';
import { Trending } from '../database/schemas/Trending.js';
import { config } from '../config/env.js';
import mongoose from 'mongoose';

// In-memory trending cache to avoid DB on every autoplay request
let trendingCache = null;
let cacheTimestamp = 0;
const MEMORY_TTL = 30 * 60 * 1000; // 30 min

/**
 * Fetch trending tracks from cache or update
 */
export async function getTrendingTracks() {
    // 1. Check in-memory cache
    if (trendingCache && Date.now() - cacheTimestamp < MEMORY_TTL) {
        return trendingCache;
    }

    // 2. Try DB cache
    if (mongoose.connection.readyState === 1) {
        try {
            const cached = await Trending.find().sort({ score: -1 }).limit(50).lean();
            if (cached.length > 0) {
                trendingCache = cached;
                cacheTimestamp = Date.now();
                return cached;
            }
        } catch {}
    }

    // 3. Fallback
    const fallback = getDefaultTrending();
    trendingCache = fallback;
    cacheTimestamp = Date.now();
    return fallback;
}

/**
 * Update trending cache (call periodically)
 * Uses AI when available to generate fresh, diverse trending lists
 */
export async function updateTrendingCache() {
    let tracks;

    // Try AI-generated trending first
    if (config.aiApiKey) {
        try {
            tracks = await fetchAITrending();
            logger.info(`AI generated ${tracks.length} fresh trending tracks`);
        } catch (err) {
            logger.debug(`AI trending generation failed: ${err.message}`);
        }
    }

    // Fallback to default curated list
    if (!tracks || tracks.length === 0) {
        tracks = getDefaultTrending();
    }

    // Update memory cache
    trendingCache = tracks;
    cacheTimestamp = Date.now();

    // Persist to DB
    if (mongoose.connection.readyState !== 1) return;

    try {
        for (const track of tracks) {
            await Trending.findOneAndUpdate(
                { query: track.query },
                track,
                { upsert: true, new: true }
            ).catch(() => {});
        }

        logger.info(`Updated trending cache: ${tracks.length} tracks`);
    } catch (err) {
        logger.debug(`Trending cache update failed: ${err.message}`);
    }
}

/**
 * Use AI to generate a diverse list of currently trending songs
 */
async function fetchAITrending() {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: config.aiApiKey });

    const response = await openai.chat.completions.create({
        model: config.aiModel,
        temperature: 0.9,
        max_tokens: 1500,
        messages: [
            {
                role: 'system',
                content: 'You are a music expert. Generate a diverse list of 25 currently popular and trending songs across multiple genres (pop, hip-hop, R&B, rock, electronic, latin, indie). Return ONLY a JSON array of objects with "title", "artist", and "query" fields. The "query" field should be "Artist - Title". No markdown, no explanation, just the JSON array.',
            },
            {
                role: 'user',
                content: `Generate 25 trending songs as of ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}. Mix genres widely. Include both global hits and rising tracks.`,
            },
        ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return [];

    // Parse JSON (handle potential markdown code fences)
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    return parsed.map((item, i) => ({
        title: item.title || 'Unknown',
        artist: item.artist || 'Unknown',
        query: item.query || `${item.artist} - ${item.title}`,
        source: 'ai',
        score: 100 - i * 2,
    }));
}

/**
 * Curated fallback list of well-known songs across genres
 */
function getDefaultTrending() {
    return [
        { title: 'Blinding Lights', artist: 'The Weeknd', query: 'The Weeknd - Blinding Lights', source: 'curated', score: 100 },
        { title: 'Heat Waves', artist: 'Glass Animals', query: 'Glass Animals - Heat Waves', source: 'curated', score: 95 },
        { title: 'Levitating', artist: 'Dua Lipa', query: 'Dua Lipa - Levitating', source: 'curated', score: 90 },
        { title: 'Stay', artist: 'The Kid LAROI', query: 'The Kid LAROI Justin Bieber - Stay', source: 'curated', score: 88 },
        { title: 'Peaches', artist: 'Justin Bieber', query: 'Justin Bieber - Peaches', source: 'curated', score: 85 },
        { title: 'Montero', artist: 'Lil Nas X', query: 'Lil Nas X - MONTERO', source: 'curated', score: 83 },
        { title: 'good 4 u', artist: 'Olivia Rodrigo', query: 'Olivia Rodrigo - good 4 u', source: 'curated', score: 80 },
        { title: 'Kiss Me More', artist: 'Doja Cat', query: 'Doja Cat - Kiss Me More', source: 'curated', score: 78 },
        { title: 'Save Your Tears', artist: 'The Weeknd', query: 'The Weeknd - Save Your Tears', source: 'curated', score: 75 },
        { title: 'Beggin', artist: 'Maneskin', query: 'Maneskin - Beggin', source: 'curated', score: 73 },
        { title: 'Industry Baby', artist: 'Lil Nas X', query: 'Lil Nas X - Industry Baby', source: 'curated', score: 70 },
        { title: 'Shivers', artist: 'Ed Sheeran', query: 'Ed Sheeran - Shivers', source: 'curated', score: 68 },
        { title: 'Bad Habits', artist: 'Ed Sheeran', query: 'Ed Sheeran - Bad Habits', source: 'curated', score: 65 },
        { title: 'Easy On Me', artist: 'Adele', query: 'Adele - Easy On Me', source: 'curated', score: 63 },
        { title: 'As It Was', artist: 'Harry Styles', query: 'Harry Styles - As It Was', source: 'curated', score: 60 },
        { title: 'Anti-Hero', artist: 'Taylor Swift', query: 'Taylor Swift - Anti-Hero', source: 'curated', score: 58 },
        { title: 'Flowers', artist: 'Miley Cyrus', query: 'Miley Cyrus - Flowers', source: 'curated', score: 55 },
        { title: 'Cruel Summer', artist: 'Taylor Swift', query: 'Taylor Swift - Cruel Summer', source: 'curated', score: 53 },
        { title: 'Paint The Town Red', artist: 'Doja Cat', query: 'Doja Cat - Paint The Town Red', source: 'curated', score: 50 },
        { title: 'Vampire', artist: 'Olivia Rodrigo', query: 'Olivia Rodrigo - vampire', source: 'curated', score: 48 },
    ];
}

/**
 * Get trending tracks filtered by genre/mood
 */
export async function getTrendingByGenre(genre) {
    const all = await getTrendingTracks();
    // Simple filter — in production use AI classification
    return all.filter(t =>
        t.title.toLowerCase().includes(genre.toLowerCase()) ||
        t.artist.toLowerCase().includes(genre.toLowerCase())
    );
}
