const {
    Client,
    GatewayIntentBits,
    Partials,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionsBitField
} = require('discord.js');

// ==============================
// Bot設定
// ==============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// 募集中データ
const recruitments = new Map();

// ==============================
// 時刻処理
// ==============================

function parseDateTime(input) {
    if (!input) return null;

    const text = input.trim();

    // 「22:00」
    let match = text.match(/^(\d{1,2}):(\d{2})$/);

    if (match) {
        const hour = Number(match[1]);
        const minute = Number(match[2]);

        const now = new Date();

        const date = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            hour,
            minute,
            0
        );

        // 過去の時刻なら翌日
        if (date.getTime() <= Date.now()) {
            date.setDate(date.getDate() + 1);
        }

        return date;
    }

    // 「2026/09/26 22:00」
    match = text.match(
        /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/
    );

    if (match) {
        return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            0
        );
    }

    // 「2026年9月26日 22:00」
    match = text.match(
        /^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/
    );

    if (match) {
        return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            0
        );
    }

    return null;
}

// ==============================
// 日本語日時表示
// ==============================

function formatJapaneseDate(date) {
    const days = [
        '日曜日',
        '月曜日',
        '火曜日',
        '水曜日',
        '木曜日',
        '金曜日',
        '土曜日'
    ];

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = days[date.getDay()];
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${year}年${month}月${day}日${weekday} ${hour}:${minute}`;
}

// ==============================
// 募集Embed作成
// ==============================

function createRecruitmentEmbed(data) {
    const participantText =
        data.participants.length > 0
            ? data.participants.map(id => `<@${id}>`).join('\n')
            : 'まだいません';

    const status =
        data.closed
            ? '🔴 募集終了'
            : data.participants.length >= data.maxMembers
                ? '🔴 満員'
                : '🟢 募集中';

    return new EmbedBuilder()
        .setTitle('🎮 スプラ募集')
        .setColor(data.closed ? 0xed4245 : 0x57f287)
        .addFields(
            {
                name: '募集種類',
                value: data.type,
                inline: false
            },
            {
                name: '募集内容',
                value: data.content,
                inline: false
            },
            {
                name: '人数',
                value: `${data.participants.length}/${data.maxMembers}`,
                inline: false
            },
            {
                name: '開始時刻',
                value: formatJapaneseDate(data.startTime),
                inline: false
            },
            {
                name: '終了時刻',
                value: formatJapaneseDate(data.endTime),
                inline: false
            },
            {
                name: '主催者',
                value: `<@${data.hostId}>`,
                inline: false
            },
            {
                name: '参加者',
                value: participantText,
                inline: false
            },
            {
                name: '状態',
                value: status,
                inline: false
            }
        )
        .setFooter({
            text: `募集ID: ${data.id}`
        });
}

// ==============================
// ボタン作成
// ==============================

function createRecruitmentButtons(data) {
    const joinButton = new ButtonBuilder()
        .setCustomId(`recruit_join_${data.id}`)
        .setLabel('参加')
        .setStyle(ButtonStyle.Success)
        .setDisabled(
            data.closed ||
            data.participants.length >= data.maxMembers
        );

    const leaveButton = new ButtonBuilder()
        .setCustomId(`recruit_leave_${data.id}`)
        .setLabel('退出')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(data.closed);

    const endButton = new ButtonBuilder()
        .setCustomId(`recruit_end_${data.id}`)
        .setLabel('募集終了')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(data.closed);

    return new ActionRowBuilder().addComponents(
        joinButton,
        leaveButton,
        endButton
    );
}

// ==============================
// 募集対象ロール選択
// ==============================

function createRoleSelect(guild) {
    const roles = guild.roles.cache
        .filter(role => role.id !== guild.id)
        .filter(role => !role.managed)
        .sort((a, b) => b.position - a.position);

    const options = [
        {
            label: '@everyone',
            value: 'EVERYONE',
            description: 'サーバー全員を募集対象にする'
        }
    ];

    for (const role of roles.values()) {
        if (options.length >= 25) break;

        options.push({
            label: role.name.substring(0, 100),
            value: role.id,
            description: `ロール「${role.name.substring(0, 80)}」`
        });
    }

    return new StringSelectMenuBuilder()
        .setCustomId('recruit_role_select')
        .setPlaceholder('募集対象を選択')
        .setMinValues(1)
        .setMaxValues(Math.min(options.length, 25))
        .addOptions(options);
}

// ==============================
// Bot起動
// ==============================

client.once('ready', async () => {
    console.log(`スターティングコンテナ`);

    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('募集')
                .setDescription('スプラトゥーンの募集を作成します')
        ];

        await client.application.commands.set(
            commands.map(command => command.toJSON())
        );

        console.log('スラッシュコマンドを同期しました！');
        console.log(`${client.user.tag} でログインしました！`);

    } catch (error) {
        console.error('コマンド同期エラー:', error);
    }
});

// ==============================
// Interaction
// ==============================

client.on('interactionCreate', async interaction => {

    // ==========================
    // /募集
    // ==========================

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === '募集') {

            const modal = new ModalBuilder()
                .setCustomId('recruitment_modal')
                .setTitle('スプラ募集');

            const typeInput = new TextInputBuilder()
                .setCustomId('recruit_type')
                .setLabel('募集種類')
                .setPlaceholder('例：オープン募集、プラベ募集、イベントマッチ')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            const contentInput = new TextInputBuilder()
                .setCustomId('recruit_content')
                .setLabel('募集内容')
                .setPlaceholder('例：武器ランダムプラベ、ガチプ、ゆるく遊びます')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            const memberInput = new TextInputBuilder()
                .setCustomId('recruit_members')
                .setLabel('募集人数')
                .setPlaceholder('2〜8')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const startInput = new TextInputBuilder()
                .setCustomId('recruit_start')
                .setLabel('開始時刻')
                .setPlaceholder('例：22:00 または 2026/09/26 22:00')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const endInput = new TextInputBuilder()
                .setCustomId('recruit_end')
                .setLabel('終了時刻')
                .setPlaceholder('例：23:00 または 2026/09/26 23:00')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(typeInput),
                new ActionRowBuilder().addComponents(contentInput),
                new ActionRowBuilder().addComponents(memberInput),
                new ActionRowBuilder().addComponents(startInput),
                new ActionRowBuilder().addComponents(endInput)
            );

            await interaction.showModal(modal);
        }

        return;
    }

    // ==========================
    // 募集フォーム送信
    // ==========================

    if (
        interaction.isModalSubmit() &&
        interaction.customId === 'recruitment_modal'
    ) {

        const type =
            interaction.fields.getTextInputValue('recruit_type');

        const content =
            interaction.fields.getTextInputValue('recruit_content');

        const memberText =
            interaction.fields.getTextInputValue('recruit_members');

        const startText =
            interaction.fields.getTextInputValue('recruit_start');

        const endText =
            interaction.fields.getTextInputValue('recruit_end');

        const maxMembers = Number(memberText);

        if (
            !Number.isInteger(maxMembers) ||
            maxMembers < 2 ||
            maxMembers > 8
        ) {
            await interaction.reply({
                content: '❌ 募集人数は2〜8人で入力してください。',
                ephemeral: true
            });
            return;
        }

        const startTime = parseDateTime(startText);
        const endTime = parseDateTime(endText);

        if (!startTime || !endTime) {
            await interaction.reply({
                content:
                    '❌ 時刻の形式が正しくありません。\n' +
                    '例：22:00\n' +
                    '例：2026/09/26 22:00',
                ephemeral: true
            });
            return;
        }

        if (endTime <= startTime) {
            await interaction.reply({
                content: '❌ 終了時刻は開始時刻より後にしてください。',
                ephemeral: true
            });
            return;
        }

        const selectMenu = createRoleSelect(interaction.guild);

        const row = new ActionRowBuilder()
            .addComponents(selectMenu);

        await interaction.reply({
            content:
                '### 募集対象を選択してください\n' +
                '複数のロールを選択すると、**いずれかのロールを持っている人**が参加できます。\n' +
                '`@everyone` を選択するとサーバー全員が対象になります。',
            components: [row],
            ephemeral: true
        });

        // フォーム内容を一時保存
        interaction.client.tempRecruitmentData ??= new Map();

        interaction.client.tempRecruitmentData.set(
            interaction.user.id,
            {
                type,
                content,
                maxMembers,
                startTime,
                endTime,
                hostId: interaction.user.id,
                channelId: interaction.channelId
            }
        );

        return;
    }

    // ==========================
    // 募集対象選択
    // ==========================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'recruit_role_select'
    ) {

        const temp =
            interaction.client.tempRecruitmentData?.get(
                interaction.user.id
            );

        if (!temp) {
            await interaction.update({
                content: '❌ 募集情報の有効期限が切れています。もう一度 `/募集` を実行してください。',
                components: []
            });
            return;
        }

        const selectedRoles = interaction.values;

        const recruitmentId =
            `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const data = {
            id: recruitmentId,
            type: temp.type,
            content: temp.content,
            maxMembers: temp.maxMembers,
            startTime: temp.startTime,
            endTime: temp.endTime,
            hostId: temp.hostId,
            participants: [temp.hostId],
            allowedRoles: selectedRoles,
            closed: false,
            channelId: temp.channelId,
            messageId: null
        };

        recruitments.set(recruitmentId, data);

        const channel =
            interaction.guild.channels.cache.get(temp.channelId);

        if (!channel) {
            await interaction.update({
                content: '❌ 募集チャンネルが見つかりません。',
                components: []
            });
            return;
        }

        // ==========================
        // メンション作成
        // ==========================

        let mentionText = '';

        if (selectedRoles.includes('EVERYONE')) {
            mentionText = '@everyone';
        } else {
            mentionText = selectedRoles
                .map(roleId => `<@&${roleId}>`)
                .join(' ');
        }

        const message =
            await channel.send({
                content: mentionText,
                embeds: [createRecruitmentEmbed(data)],
                components: [createRecruitmentButtons(data)],
                allowedMentions: {
                    parse: selectedRoles.includes('EVERYONE')
                        ? ['everyone']
                        : [],
                    roles: selectedRoles.includes('EVERYONE')
                        ? []
                        : selectedRoles
                }
            });

        data.messageId = message.id;

        interaction.client.tempRecruitmentData.delete(
            interaction.user.id
        );

        await interaction.update({
            content: '✅ 募集を作成しました！',
            components: []
        });

        return;
    }

    // ==========================
    // 参加
    // ==========================

    if (
        interaction.isButton() &&
        interaction.customId.startsWith('recruit_join_')
    ) {

        const id =
            interaction.customId.replace('recruit_join_', '');

        const data = recruitments.get(id);

        if (!data) {
            await interaction.reply({
                content: '❌ この募集は見つかりません。',
                ephemeral: true
            });
            return;
        }

        if (data.closed) {
            await interaction.reply({
                content: '❌ この募集は終了しています。',
                ephemeral: true
            });
            return;
        }

        if (data.participants.includes(interaction.user.id)) {
            await interaction.reply({
                content: '⚠️ すでに参加しています。',
                ephemeral: true
            });
            return;
        }

        if (data.participants.length >= data.maxMembers) {
            await interaction.reply({
                content: '❌ この募集は満員です。',
                ephemeral: true
            });
            return;
        }

        // ==========================
        // ロールチェック
        // ==========================

        const isEveryone =
            data.allowedRoles.includes('EVERYONE');

        if (!isEveryone) {

            const member =
                await interaction.guild.members.fetch(
                    interaction.user.id
                );

            const hasRole =
                data.allowedRoles.some(roleId =>
                    member.roles.cache.has(roleId)
                );

            if (!hasRole) {
                await interaction.reply({
                    content:
                        '❌ この募集に参加するためのロールを持っていません。',
                    ephemeral: true
                });
                return;
            }
        }

        data.participants.push(interaction.user.id);

        if (
            data.participants.length >=
            data.maxMembers
        ) {
            data.closed = true;
        }

        const message =
            await interaction.channel.messages.fetch(
                data.messageId
            );

        await message.edit({
            embeds: [createRecruitmentEmbed(data)],
            components: [createRecruitmentButtons(data)]
        });

        await interaction.reply({
            content: data.closed
                ? '✅ 参加しました！募集人数に達したため募集を締め切りました。'
                : '✅ 募集に参加しました！',
            ephemeral: true
        });

        return;
    }

    // ==========================
    // 退出
    // ==========================

    if (
        interaction.isButton() &&
        interaction.customId.startsWith('recruit_leave_')
    ) {

        const id =
            interaction.customId.replace('recruit_leave_', '');

        const data = recruitments.get(id);

        if (!data) {
            await interaction.reply({
                content: '❌ この募集は見つかりません。',
                ephemeral: true
            });
            return;
        }

        if (data.closed) {
            await interaction.reply({
                content: '❌ この募集は終了しています。',
                ephemeral: true
            });
            return;
        }

        if (
            !data.participants.includes(
                interaction.user.id
            )
        ) {
            await interaction.reply({
                content: '⚠️ この募集に参加していません。',
                ephemeral: true
            });
            return;
        }

        if (interaction.user.id === data.hostId) {
            await interaction.reply({
                content: '❌ 募集主は退出できません。募集終了を押してください。',
                ephemeral: true
            });
            return;
        }

        data.participants =
            data.participants.filter(
                id => id !== interaction.user.id
            );

        const message =
            await interaction.channel.messages.fetch(
                data.messageId
            );

        await message.edit({
            embeds: [createRecruitmentEmbed(data)],
            components: [createRecruitmentButtons(data)]
        });

        await interaction.reply({
            content: '✅ 募集から退出しました。',
            ephemeral: true
        });

        return;
    }

    // ==========================
    // 募集終了
    // ==========================

    if (
        interaction.isButton() &&
        interaction.customId.startsWith('recruit_end_')
    ) {

        const id =
            interaction.customId.replace('recruit_end_', '');

        const data = recruitments.get(id);

        if (!data) {
            await interaction.reply({
                content: '❌ この募集は見つかりません。',
                ephemeral: true
            });
            return;
        }

        if (interaction.user.id !== data.hostId) {
            await interaction.reply({
                content:
                    '❌ 募集を終了できるのは募集主だけです。',
                ephemeral: true
            });
            return;
        }

        data.closed = true;

        const message =
            await interaction.channel.messages.fetch(
                data.messageId
            );

        await message.edit({
            embeds: [createRecruitmentEmbed(data)],
            components: [createRecruitmentButtons(data)]
        });

        await interaction.reply({
            content: '✅ 募集を終了しました。',
            ephemeral: true
        });

        return;
    }
});

// ==============================
// エラー処理
// ==============================

process.on('unhandledRejection', error => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
});

// ==============================
// ログイン
// ==============================

client.login(process.env.DISCORD_TOKEN);
