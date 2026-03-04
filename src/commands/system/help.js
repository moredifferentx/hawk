import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands and how to use the bot');

export async function execute(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: '🎵 Discord Music Bot — Help' })
        .setDescription('A feature-rich music bot with AI autoplay, multi-source support, and a dedicated request channel.')
        .addFields(
            {
                name: '🎶 Music Commands',
                value: [
                    '`/play <query>` — Play a song or add to queue',
                    '`/skip` — Skip the current track',
                    '`/pause` — Pause playback',
                    '`/resume` — Resume playback',
                    '`/stop` — Stop and clear the queue',
                    '`/queue [page]` — View the queue',
                    '`/nowplaying` — Show current track details',
                    '`/volume <1-100>` — Set volume',
                    '`/seek <position>` — Jump to position (e.g. 1:30)',
                    '`/lyrics [query]` — Get lyrics',
                ].join('\n'),
            },
            {
                name: '🔧 Queue Management',
                value: [
                    '`/shuffle` — Shuffle the queue',
                    '`/loop <off|track|queue>` — Set loop mode',
                    '`/move <from> <to>` — Move a track in queue',
                    '`/remove <position>` — Remove a track',
                    '`/autoplay` — Toggle AI autoplay',
                    '`/247` — Toggle 24/7 mode',
                ].join('\n'),
            },
            {
                name: '🔌 Connection',
                value: '`/disconnect` — Leave voice channel',
            },
            {
                name: '⚙️ Admin',
                value: '`/setup` — Create a dedicated music request channel (requires Manage Channels)',
            },
            {
                name: '🎵 Supported Sources',
                value: 'YouTube, Spotify, SoundCloud, Apple Music, Deezer, Bandcamp, Twitch, Vimeo, and direct URLs',
            },
            {
                name: '📝 Request Channel',
                value: 'Use `/setup` to create a music channel. Then just type a song name or paste a URL — no slash command needed!',
            }
        )
        .setFooter({ text: 'Use /play to get started!' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
