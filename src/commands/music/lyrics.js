import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Get lyrics for the current track or a search query')
    .addStringOption(opt =>
        opt.setName('query')
            .setDescription('Song to search lyrics for (defaults to current track)')
            .setRequired(false)
    );

export async function execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const queue = client.playerManager.queues.get(interaction.guildId);
    const query = interaction.options.getString('query');

    let searchTitle = query;
    let searchArtist = '';

    // If no query, use current track
    if (!searchTitle) {
        if (!queue?.currentTrack) {
            return interaction.editReply('❌ Nothing is playing and no query provided.');
        }
        searchTitle = queue.currentTrack.info.title;
        searchArtist = queue.currentTrack.info.author;
    }

    // Clean metadata noise from title/artist
    const cleanTitle = searchTitle.replace(/\(.*?\)|\[.*?\]|official\s*(video|audio|lyrics)/gi, '').trim();
    const cleanArtist = searchArtist.replace(/- Topic$/i, '').replace(/VEVO$/i, '').trim() || '';

    try {
        const { default: axios } = await import('axios');
        let lyricsText = null;

        // Strategy 1: lrclib.net (most reliable free API)
        try {
            const res = await axios.get('https://lrclib.net/api/search', {
                params: {
                    q: cleanArtist ? `${cleanArtist} ${cleanTitle}` : cleanTitle,
                },
                timeout: 8000,
                headers: { 'User-Agent': 'DiscordMusicBot/1.0' },
            });
            if (res.data?.[0]?.plainLyrics) {
                lyricsText = res.data[0].plainLyrics;
            } else if (res.data?.[0]?.syncedLyrics) {
                // Strip timing tags from synced lyrics: [mm:ss.xx]
                lyricsText = res.data[0].syncedLyrics
                    .replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '')
                    .trim();
            }
        } catch {
            // Fall through to next provider
        }

        // Strategy 2: lyrics.ovh (free, no API key)
        if (!lyricsText && cleanArtist) {
            try {
                const res = await axios.get(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`,
                    { timeout: 8000 }
                );
                if (res.data?.lyrics) {
                    lyricsText = res.data.lyrics;
                }
            } catch {
                // Fall through
            }
        }

        if (!lyricsText) {
            return interaction.editReply(`❌ No lyrics found for **${searchTitle}**.`);
        }

        // Discord embed has a 4096 char limit — truncate safely
        const maxLen = 3900;
        const truncated = lyricsText.length > maxLen
            ? lyricsText.substring(0, maxLen) + '\n\n*... lyrics truncated ...*'
            : lyricsText;

        const displayTitle = cleanArtist
            ? `${cleanArtist} — ${cleanTitle}`
            : cleanTitle;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: '📝 Lyrics' })
            .setTitle(displayTitle.substring(0, 256))
            .setDescription(truncated)
            .setFooter({ text: 'Lyrics may not be 100% accurate • Source: lrclib.net / lyrics.ovh' })
            .setTimestamp();

        if (queue?.currentTrack?.info?.artworkUrl && !query) {
            embed.setThumbnail(queue.currentTrack.info.artworkUrl);
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        logger.error(`Lyrics error: ${err.message}`);
        await interaction.editReply(`❌ Failed to fetch lyrics: ${err.message}`);
    }
}
