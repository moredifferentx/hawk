import mongoose from 'mongoose';

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true, index: true },
    requestChannelId: { type: String, default: '' },
    playerMessageId: { type: String, default: '' },
    autoplay: { type: Boolean, default: true },
    volume: { type: Number, default: 80, min: 0, max: 100 },
    loopMode: { type: String, enum: ['off', 'track', 'queue'], default: 'off' },
    twentyFourSeven: { type: Boolean, default: false },
    djRoleId: { type: String, default: '' },
}, { timestamps: true });

export const Guild = mongoose.model('Guild', guildSchema);
