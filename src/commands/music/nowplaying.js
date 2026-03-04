import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { formatDuration, createProgressBar, truncate } from '../../utils/helpers.js';

export const data = new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show details about the currently playing track');

export async function execute(interaction, client) {
    const queue = client.playerManager.queues.get(interaction.guildId);
    if (!queue?.currentTrack) {
        return interaction.reply({ content: '❌ Nothing is playing right now.', flags: MessageFlags.Ephemeral });
    }

    const track = queue.currentTrack;
    const info = track.info;
    const position = queue.currentPosition || 0;
    const duration = info.length || 0;
    const progress = createProgressBar(position, duration, 22);
    const posStr = formatDuration(position);
    const durStr = info.isStream ? '🔴 LIVE' : formatDuration(duration);

    const embed = new EmbedBuilder()
        .setColor(queue.paused ? 0xFEE75C : 0x5865F2)
        .setAuthor({ name: queue.paused ? '⏸ Paused' : '🎵 Now Playing' })
        .setTitle(truncate(info.title, 60))
        .setURL(info.uri || null)
        .setDescription([
            `**Artist:** ${info.author}`,
            `**Source:** ${info.sourceName || 'Unknown'}`,
            '',
            `${progress}`,
            `**${posStr}** / **${durStr}**`,
            '',
            `🔊 Volume: **${queue.volume}%** • Loop: **${queue.loopMode}** • Autoplay: **${queue.autoplay ? 'On' : 'Off'}**`,
        ].join('\n'));

    if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);
    if (track.requestedBy) embed.setFooter({ text: `Requested by ${track.requestedBy}` });
    embed.setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
