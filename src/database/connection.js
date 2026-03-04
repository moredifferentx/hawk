import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export async function connectDatabase(uri) {
    if (!uri) {
        logger.warn('No MONGO_URI set — database features disabled');
        return false;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 30000,
        });
        logger.info('Connected to MongoDB');
        return true;
    } catch (err) {
        logger.error(`MongoDB connection failed: ${err.message}`);
        return false;
    }
}

// Auto-reconnection
mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — attempting reconnect...');
});

mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB error: ${err.message}`);
});
