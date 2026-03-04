import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume')
    .addIntegerOption(opt =>
        opt.setName('level')
            .setDescription('Volume level (1-100)')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
    );

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const level = interaction.options.getInteger('level');
    await client.playerManager.setVolume(interaction.guildId, level);
    await interaction.reply({ content: `🔊 Volume set to **${level}%**`, flags: MessageFlags.Ephemeral });
}
