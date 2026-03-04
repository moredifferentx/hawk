import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a specific position in the current track')
    .addStringOption(opt =>
        opt.setName('position')
            .setDescription('Position to seek to (e.g. 1:30, 90, 2:15:00)')
            .setRequired(true)
    );

/**
 * Parse time string into milliseconds
 * Supports: "90" (seconds), "1:30" (mm:ss), "1:30:00" (hh:mm:ss)
 */
function parseTime(str) {
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return null;

    if (parts.length === 1) return parts[0] * 1000;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return null;
}

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const queue = client.playerManager.queues.get(interaction.guildId);
    const player = client.playerManager.shoukaku.players.get(interaction.guildId);
    if (!queue?.currentTrack || !player) {
        return interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral });
    }

    if (queue.currentTrack.info.isStream) {
        return interaction.reply({ content: '❌ Cannot seek in a live stream.', flags: MessageFlags.Ephemeral });
    }

    const input = interaction.options.getString('position');
    const ms = parseTime(input);
    if (ms === null || ms < 0) {
        return interaction.reply({ content: '❌ Invalid time format. Use `1:30`, `90`, or `1:30:00`.', flags: MessageFlags.Ephemeral });
    }

    const duration = queue.currentTrack.info.length || 0;
    if (ms > duration) {
        return interaction.reply({ content: '❌ Position exceeds track duration.', flags: MessageFlags.Ephemeral });
    }

    await player.update({ position: ms });
    queue.currentPosition = ms;

    const { formatDuration } = await import('../../utils/helpers.js');
    await interaction.reply({ content: `⏩ Seeked to **${formatDuration(ms)}**`, flags: MessageFlags.Ephemeral });
}
