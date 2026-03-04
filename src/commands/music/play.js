import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption(opt =>
        opt.setName('query')
            .setDescription('Song name, URL (YouTube, Spotify, SoundCloud, etc.)')
            .setRequired(true)
    );

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const query = interaction.options.getString('query');
    const playerManager = client.playerManager;

    try {
        const result = await playerManager.play(
            interaction.guild,
            voiceChannel,
            query,
            interaction.member,
            interaction.channel
        );

        if (result) {
            if (result._playlist) {
                await interaction.editReply(`📋 Added **${result._playlist.name}** playlist to queue!`);
            } else {
                await interaction.editReply(`🎶 **${result.info.title}** by ${result.info.author}`);
            }
        } else {
            // playerManager already sent a specific error to the channel
            await interaction.editReply('❌ Could not play that track. Check the channel for details.');
        }
    } catch (err) {
        await interaction.editReply(`❌ Error: ${err.message}`);
    }
}
