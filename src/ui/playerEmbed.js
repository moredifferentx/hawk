import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { formatDuration, createProgressBar, truncate } from '../utils/helpers.js';

// Color scheme
const COLORS = {
    playing: 0x5865F2,  // Discord blurple
    paused: 0xFEE75C,   // Yellow
    idle: 0x57F287,      // Green
    error: 0xED4245,     // Red
};

/**
 * Create the now-playing embed
 */
export function createPlayerEmbed(queue, idle = false) {
    const embed = new EmbedBuilder();

    if (idle || !queue.currentTrack) {
        embed.setColor(COLORS.idle);
        embed.setAuthor({ name: '🎵 Music Player — Idle', iconURL: undefined });
        embed.setDescription(
            '**No track playing**\n\n' +
            '> 🎶 Send a song name or URL in this channel\n' +
            '> 📝 Or use `/play <song>` to get started'
        );
        embed.setFooter({ text: 'Queue is empty • Waiting for requests' });
        embed.setTimestamp();
        return embed;
    }

    const track = queue.currentTrack;
    const info = track.info;
    const position = queue.currentPosition || 0;
    const duration = info.length || 0;
    const progress = createProgressBar(position, duration, 16);
    const posStr = formatDuration(position);
    const durStr = info.isStream ? '🔴 LIVE' : formatDuration(duration);

    const isPaused = queue.paused || false;

    embed.setColor(isPaused ? COLORS.paused : COLORS.playing);
    embed.setAuthor({ name: isPaused ? '⏸ Paused' : '🎵 Now Playing' });

    // Rich title with link
    const titleLink = info.uri ? `[${truncate(info.title, 55)}](${info.uri})` : truncate(info.title, 55);

    // Status line
    const loopLabel = queue.loopMode === 'track' ? '🔂 Track' : queue.loopMode === 'queue' ? '🔁 Queue' : '';
    const autoplayLabel = queue.autoplay ? '🤖 Autoplay' : '';
    const modeStr = [loopLabel, autoplayLabel].filter(Boolean).join(' · ') || '▶️ Normal';
    const twentyFourStr = queue.twentyFourSeven ? ' · 🌙 24/7' : '';

    embed.setDescription([
        `### ${titleLink}`,
        `**${info.author}**`,
        '',
        `${progress}`,
        `**${posStr}** ─── **${durStr}**`,
        '',
        `> ${modeStr}${twentyFourStr}`,
    ].join('\n'));

    // Thumbnail
    if (info.artworkUrl) {
        embed.setThumbnail(info.artworkUrl);
    }

    // Fields
    const fields = [
        { name: '🎶 Queue', value: `${queue.size} song${queue.size !== 1 ? 's' : ''}`, inline: true },
        { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
        { name: '📡 Source', value: info.sourceName || 'Unknown', inline: true },
    ];

    if (track.requestedBy) {
        fields.push({ name: '👤 Requested by', value: track.requestedBy, inline: true });
    }

    embed.addFields(fields);

    embed.setFooter({ text: `Loop: ${queue.loopMode} • Autoplay: ${queue.autoplay ? 'On' : 'Off'}` });
    embed.setTimestamp();

    return embed;
}

/**
 * Create control buttons row
 */
export function createControlButtons(queue) {
    const isPaused = queue.paused || false;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_previous')
            .setEmoji('⏮')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji(isPaused ? '▶️' : '⏸')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji('⏭')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('music_loop')
            .setEmoji('🔁')
            .setStyle(queue.loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('music_shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary),
    );

    return row;
}

/**
 * Create a queue display embed
 */
export function createQueueEmbed(queue, page = 0) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.playing)
        .setAuthor({ name: '📋 Music Queue' });

    if (!queue.currentTrack && queue.isEmpty) {
        embed.setDescription('Queue is empty. Use `/play` or send a song name!');
        return embed;
    }

    const lines = [];

    if (queue.currentTrack) {
        const ct = queue.currentTrack.info;
        lines.push(`**Now Playing:**`);
        lines.push(`🎵 [${truncate(ct.title, 45)}](${ct.uri}) — ${formatDuration(ct.length)}`);
        lines.push('');
    }

    const pageSize = 10;
    const start = page * pageSize;
    const pageItems = queue.tracks.slice(start, start + pageSize);

    if (pageItems.length > 0) {
        lines.push('**Up Next:**');
        pageItems.forEach((track, i) => {
            const num = start + i + 1;
            lines.push(`\`${num}.\` [${truncate(track.info.title, 40)}](${track.info.uri}) — ${formatDuration(track.info.length)} | ${track.requestedBy}`);
        });
    }

    const totalPages = Math.ceil(queue.tracks.length / pageSize) || 1;
    const totalDuration = queue.tracks.reduce((acc, t) => acc + (t.info.length || 0), 0);

    embed.setDescription(lines.join('\n') || 'No tracks in queue.');
    embed.setFooter({ text: `Page ${page + 1}/${totalPages} • ${queue.size} tracks • Total: ${formatDuration(totalDuration)}` });

    return embed;
}
