import mongoose from 'mongoose';

const trendingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    artist: { type: String, default: '' },
    query: { type: String, required: true },
    source: { type: String, enum: ['spotify', 'youtube', 'tiktok', 'ai', 'curated'], default: 'youtube' },
    score: { type: Number, default: 0 },
    region: { type: String, default: 'global' },
    fetchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Auto expire after 24 hours
trendingSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 86400 });

export const Trending = mongoose.model('Trending', trendingSchema);
