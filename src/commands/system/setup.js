import { SlashCommandBuilder, MessageFlags, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { Guild } from '../../database/schemas/Guild.js';
import { createPlayerEmbed, createControlButtons } from '../../ui/playerEmbed.js';
import { invalidateChannelCache } from '../../events/messageCreate.js';
import { logger } from '../../utils/logger.js';
import mongoose from 'mongoose';

export const data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create a dedicated music request channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Check if a request channel already exists
        if (mongoose.connection.readyState === 1) {
            const existing = await Guild.findOne({ guildId: interaction.guildId }).lean();
            if (existing?.requestChannelId) {
                const existingCh = interaction.guild.channels.cache.get(existing.requestChannelId);
                if (existingCh) {
                    return interaction.editReply(
                        `⚠️ A music request channel already exists: ${existingCh}\nDelete it first or use \`/setup\` again after removing it.`
                    );
                }
                // Channel was deleted — continue and create a new one
            }
        }

        // Create the request channel
        const channel = await interaction.guild.channels.create({
            name: '🎵│music-requests',
            type: ChannelType.GuildText,
            topic: '🎵 Send a song name or URL here to play music! Messages auto-delete.',
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.EmbedLinks,
                    ],
                },
            ],
        });

        // Create initial player embed
        const queue = client.playerManager.getQueue(interaction.guildId);
        queue.textChannel = channel;
        const embed = createPlayerEmbed(queue, true);
        const buttons = createControlButtons(queue);
        const playerMsg = await channel.send({ embeds: [embed], components: [buttons] });
        queue.playerMessageId = playerMsg.id;

        // Send instructions
        const instructionEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎵 Music Request Channel')
            .setDescription([
                'Welcome to the music request channel!',
                '',
                '**How to use:**',
                '• Type a song name or paste a URL',
                '• Your message will auto-delete',
                '• The player embed above will update',
                '',
                '**Supported sources:**',
                'YouTube, Spotify, Apple Music, SoundCloud, Bandcamp, and more!',
                '',
                '**Slash commands also work:**',
                '`/play`, `/skip`, `/pause`, `/resume`, `/queue`, `/volume`, `/loop`, `/shuffle`, `/autoplay`',
            ].join('\n'));
        await channel.send({ embeds: [instructionEmbed] });

        // Save to database
        if (mongoose.connection.readyState === 1) {
            await Guild.findOneAndUpdate(
                { guildId: interaction.guildId },
                {
                    guildId: interaction.guildId,
                    requestChannelId: channel.id,
                    playerMessageId: playerMsg.id,
                },
                { upsert: true, new: true }
            );
            // Invalidate cached channel ID so messageCreate picks up the new channel
            invalidateChannelCache(interaction.guildId);
        }

        await interaction.editReply(`✅ Music request channel created: ${channel}`);
    } catch (err) {
        logger.error(`Setup error: ${err.message}`);
        await interaction.editReply(`❌ Failed to create channel: ${err.message}`);
    }
}
