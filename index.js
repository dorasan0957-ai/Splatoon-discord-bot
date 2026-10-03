process.env.TZ = 'Asia/Tokyo';

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// ==============================
// データ
// ==============================

const recruitments = new Map();

client.recruitmentDrafts = new Map();

// ==============================
// 募集で選択可能なパワーロール
// ==============================

const POWER_ROLES = [
    {
        label: '～19',
        names: ['～19', '~19']
    },
    {
        label: '20～24',
        names: ['20～24', '20~24']
    },
    {
        label: '25～26',
        names: ['25～26', '25~26']
    },
    {
        label: '27～29',
        names: ['27～29', '27~29']
    },
    {
        label: '30～34',
        names: ['30～34', '30~34']
    },
    {
        label: '35～',
        names: ['35～', '35~']
    }
];

// ==============================
// 時刻処理
// ==============================

function formatJapaneseDateTime(date) {
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

function parseTime(input) {
    const now = new Date();

    input = input.trim();

    const timeMatch =
        input.match(/^(\d{1,2}):(\d{2})$/);

    if (timeMatch) {
        const hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2]);

        if (
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        const date = new Date(now);

        date.setHours(hour);
        date.setMinutes(minute);
        date.setSeconds(0);
        date.setMilliseconds(0);

        if (date <= now) {
            date.setDate(date.getDate() + 1);
        }

        return date;
    }

    const dateMatch =
        input.match(
            /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/
        );

    if (dateMatch) {
        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);
        const hour = Number(dateMatch[4]);
        const minute = Number(dateMatch[5]);

        if (
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31 ||
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        const date = new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            0,
            0
        );

        if (date <= now) {
            return null;
        }

        return date;
    }

    return null;
}

// ==============================
// 終了時刻
// ==============================

function parseEndTime(input, startTime) {
    input = input.trim();

    const timeMatch =
        input.match(/^(\d{1,2}):(\d{2})$/);

    if (timeMatch) {
        const hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2]);

        if (
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        const date = new Date(startTime);

        date.setHours(hour);
        date.setMinutes(minute);
        date.setSeconds(0);
        date.setMilliseconds(0);

        if (date <= startTime) {
            date.setDate(date.getDate() + 1);
        }

        return date;
    }

    const dateMatch =
        input.match(
            /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/
        );

    if (dateMatch) {
        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);
        const hour = Number(dateMatch[4]);
        const minute = Number(dateMatch[5]);

        if (
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31 ||
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        const date = new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            0,
            0
        );

        if (date <= startTime) {
            return null;
        }

        return date;
    }

    return null;
}

// ==============================
// 通話表示
// ==============================

function getVoiceText(value) {
    switch (value) {
        case 'voice_yes_listen_ok':
            return '🎙️ 通話あり（聞き専⭕️）';

        case 'voice_yes_listen_ng':
            return '🎙️ 通話あり（聞き専❌）';

        case 'voice_no':
            return '🔇 通話なし';

        default:
            return '🔇 通話なし';
    }
}

// ==============================
// パワーロール取得
// ==============================

function getPowerRoles(guild) {
    const result = [];

    for (const config of POWER_ROLES) {
        let role = null;

        for (const name of config.names) {
            role =
                guild.roles.cache.find(
                    r => r.name === name
                );

            if (role) {
                break;
            }
        }

        if (role) {
            result.push({
                label: config.label,
                role
            });
        }
    }

    return result;
}

// ==============================
// 募集メッセージ更新
// ==============================

async function updateRecruitmentMessage(
    recruitment
) {
    try {
        const channel =
            await client.channels.fetch(
                recruitment.channelId
            );

        if (!channel) return;

        const message =
            await channel.messages.fetch(
                recruitment.messageId
            );

        if (!message) return;

        const participantMentions =
            recruitment.participants
                .map(id => `<@${id}>`)
                .join(' ');

        const startText =
            formatJapaneseDateTime(recruitment.startTime);

        const endText =
            formatJapaneseDateTime(recruitment.endTime);

        let statusText =
            '🟢 募集中';

        if (recruitment.closed) {
            statusText =
                '🔒 募集終了';
        } else if (recruitment.started) {
            statusText =
                '🟢 開始済み';
        } else if (
            recruitment.participants.length >=
            recruitment.maxPlayers
        ) {
            statusText =
                '🔒 定員到達';
        }

        const embed =
            new EmbedBuilder()
                .setTitle('🎮 スプラ募集')
                .setDescription(
                    `**募集種類**\n` +
                    `${recruitment.type}\n\n` +

                    `**募集内容**\n` +
                    `${recruitment.content}\n\n` +

                    `**人数**\n` +
                    `${recruitment.participants.length}/${recruitment.maxPlayers}\n\n` +

                    `**通話**\n` +
                    `${getVoiceText(recruitment.voice)}\n\n` +

                    `**開始時刻**\n` +
                    `${startText}\n\n` +

                    `**終了時刻**\n` +
                    `${endText}\n\n` +

                    `**主催者**\n` +
                    `<@${recruitment.hostId}>\n\n` +

                    `**参加者**\n` +
                    `${participantMentions || 'なし'}\n\n` +

                    `**状態**\n` +
                    `${statusText}`
                )
                .setFooter({
                    text:
                        `募集ID: ${recruitment.id}`
                });

        const buttons =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `join_${recruitment.id}`
                        )
                        .setLabel('参加')
                        .setStyle(
                            ButtonStyle.Success
                        )
                        .setDisabled(
                            recruitment.closed ||
                            recruitment.participants.length >=
                                recruitment.maxPlayers
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            `leave_${recruitment.id}`
                        )
                        .setLabel('退出')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            recruitment.closed
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            `end_${recruitment.id}`
                        )
                        .setLabel('募集終了')
                        .setStyle(
                            ButtonStyle.Danger
                        )
                        .setDisabled(
                            recruitment.closed
                        )
                );

        await message.edit({
            embeds: [embed],
            components: [buttons]
        });

    } catch (error) {
        console.error(
            '募集メッセージ更新エラー:',
            error
        );
    }
}

// ==============================
// 募集終了
// ==============================

async function closeRecruitment(
    recruitment,
    reason = '募集終了'
) {
    if (recruitment.closed) return;

    recruitment.closed = true;

    try {
        const channel =
            await client.channels.fetch(
                recruitment.channelId
            );

        if (!channel) return;

        const message =
            await channel.messages.fetch(
                recruitment.messageId
            );

        if (!message) return;

        const participantMentions =
            recruitment.participants
                .map(id => `<@${id}>`)
                .join(' ');

        const startText =
            formatJapaneseDateTime(recruitment.startTime);

        const endText =
            formatJapaneseDateTime(recruitment.endTime);

        const embed =
            new EmbedBuilder()
                .setTitle(
                    '🔒 スプラ募集終了'
                )
                .setDescription(
                    `**募集種類**\n` +
                    `${recruitment.type}\n\n` +

                    `**募集内容**\n` +
                    `${recruitment.content}\n\n` +

                    `**人数**\n` +
                    `${recruitment.participants.length}/${recruitment.maxPlayers}\n\n` +

                    `**通話**\n` +
                    `${getVoiceText(recruitment.voice)}\n\n` +

                    `**開始時刻**\n` +
                    `${startText}\n\n` +

                    `**終了時刻**\n` +
                    `${endText}\n\n` +

                    `**主催者**\n` +
                    `<@${recruitment.hostId}>\n\n` +

                    `**参加者**\n` +
                    `${participantMentions || 'なし'}\n\n` +

                    `**終了理由**\n` +
                    `${reason}`
                )
                .setFooter({
                    text:
                        `募集ID: ${recruitment.id}`
                });

        await message.edit({
            embeds: [embed],
            components: []
        });

    } catch (error) {
        console.error(
            '募集終了エラー:',
            error
        );
    }
}

// ==============================
// 開始処理
// ==============================

async function startRecruitment(
    recruitment
) {
    if (
        recruitment.closed ||
        recruitment.started
    ) {
        return;
    }

    // ★ 今回変更した部分
    // 開始時刻になっても定員未達なら募集を継続する
    if (
        recruitment.participants.length <
        recruitment.maxPlayers
    ) {

        console.log(
            `募集 ${recruitment.id} は開始時刻になりましたが、定員未達のため募集を継続します`
        );

        return;
    }

    // 開始時刻までに定員に達していた場合は募集終了
    await closeRecruitment(
        recruitment,
        '開始時刻までに定員に達しました'
    );

    console.log(
        `募集 ${recruitment.id} が開始時刻に定員到達したため終了しました`
    );
}

// ==============================
// タイマー設定
// ==============================

function setupRecruitmentTimers(
    recruitment
) {
    const startDelay =
        recruitment.startTime.getTime() -
        Date.now();

    const endDelay =
        recruitment.endTime.getTime() -
        Date.now();

    if (startDelay <= 0) {
        startRecruitment(
            recruitment
        );
    } else {
        setTimeout(() => {
            startRecruitment(
                recruitment
            );
        }, startDelay);
    }

    if (endDelay > 0) {
        setTimeout(() => {
            closeRecruitment(
                recruitment,
                '設定した終了時刻になりました'
            );
        }, endDelay);
    }
}

// ==============================
// 募集作成
// ==============================

async function createRecruitment(
    interaction,
    data
) {
    const {
        type,
        content,
        maxPlayers,
        startTime,
        endTime,
        roleIds,
        voice
    } = data;

    const recruitmentId =
        `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;

    const recruitment = {
        id:
            recruitmentId,

        guildId:
            interaction.guildId,

        channelId:
            interaction.channelId,

        messageId:
            null,

        hostId:
            interaction.user.id,

        type,

        content,

        maxPlayers,

        startTime,

        endTime,

        roleIds,

        voice,

        participants: [
            interaction.user.id
        ],

        closed: false,

        started: false
    };

    recruitments.set(
        recruitmentId,
        recruitment
    );

    const roleMentions =
        roleIds.length > 0
            ? roleIds
                .map(
                    id => `<@&${id}>`
                )
                .join(' ')
            : '@everyone';

    const startText =
        formatJapaneseDateTime(recruitment.startTime);

    const endText =
        formatJapaneseDateTime(recruitment.endTime);

    const embed =
        new EmbedBuilder()
            .setTitle(
                '🎮 スプラ募集'
            )
            .setDescription(
                `**募集種類**\n` +
                `${type}\n\n` +

                `**募集内容**\n` +
                `${content}\n\n` +

                `**人数**\n` +
                `1/${maxPlayers}\n\n` +

                `**通話**\n` +
                `${getVoiceText(voice)}\n\n` +

                `**開始時刻**\n` +
                `${startText}\n\n` +

                `**終了時刻**\n` +
                `${endText}\n\n` +

                `**主催者**\n` +
                `<@${interaction.user.id}>\n\n` +

                `**参加者**\n` +
                `<@${interaction.user.id}>\n\n` +

                `**状態**\n` +
                `🟢 募集中`
            )
            .setFooter({
                text:
                    `募集ID: ${recruitmentId}`
            });

    const buttons =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `join_${recruitmentId}`
                    )
                    .setLabel('参加')
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `leave_${recruitmentId}`
                    )
                    .setLabel('退出')
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `end_${recruitmentId}`
                    )
                    .setLabel('募集終了')
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    const message =
        await interaction.channel.send({
            content:
                roleMentions,

            embeds: [
                embed
            ],

            components: [
                buttons
            ],

            allowedMentions: {
                parse:
                    roleIds.length > 0
                        ? ['roles']
                        : ['everyone']
            }
        });

    recruitment.messageId =
        message.id;

    setupRecruitmentTimers(
        recruitment
    );
}

// ==============================
// Bot起動
// ==============================

client.once(
    'ready',
    async () => {

        console.log(
            `${client.user.tag} でログインしました！`
        );

        const commands = [
            new SlashCommandBuilder()
                .setName('募集')
                .setDescription(
                    'スプラの募集を作成します'
                )
        ];

        try {

            await client.application.commands.set(
                commands
            );

            console.log(
                'スラッシュコマンドを同期しました！'
            );

        } catch (error) {

            console.error(
                'コマンド同期エラー:',
                error
            );
        }
    }
);

// ==============================
// インタラクション
// ==============================

client.on(
    'interactionCreate',
    async interaction => {

        try {

            // ==========================
            // /募集
            // ==========================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === '募集'
            ) {

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            'recruitment_modal'
                        )
                        .setTitle(
                            'スプラ募集'
                        );

                const typeInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_type'
                        )
                        .setLabel(
                            '募集種類'
                        )
                        .setPlaceholder(
                            '例：オープン募集、プラベ募集、イベントマッチ'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(100);

                const contentInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_content'
                        )
                        .setLabel(
                            '募集内容'
                        )
                        .setPlaceholder(
                            '例：武器ランダムプラベ、ガチプ、ゆるく遊びます'
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(1000);

                const playersInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_players'
                        )
                        .setLabel(
                            '募集人数'
                        )
                        .setPlaceholder(
                            '2〜10'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true);

                const startTimeInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_start_time'
                        )
                        .setLabel(
                            '開始時刻'
                        )
                        .setPlaceholder(
                            '例：21:30'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true);

                const endTimeInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_end_time'
                        )
                        .setLabel(
                            '終了時刻'
                        )
                        .setPlaceholder(
                            '例：23:00'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true);

                modal.addComponents(

                    new ActionRowBuilder()
                        .addComponents(
                            typeInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            contentInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            playersInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            startTimeInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            endTimeInput
                        )
                );

                await interaction.showModal(
                    modal
                );

                return;
            }

            // ==========================
            // モーダル送信
            // ==========================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'recruitment_modal'
            ) {

                const type =
                    interaction.fields.getTextInputValue(
                        'recruitment_type'
                    );

                const content =
                    interaction.fields.getTextInputValue(
                        'recruitment_content'
                    );

                const playersText =
                    interaction.fields.getTextInputValue(
                        'recruitment_players'
                    );

                const startTimeText =
                    interaction.fields.getTextInputValue(
                        'recruitment_start_time'
                    );

                const endTimeText =
                    interaction.fields.getTextInputValue(
                        'recruitment_end_time'
                    );

                const maxPlayers =
                    Number(playersText);

                if (
                    !Number.isInteger(
                        maxPlayers
                    ) ||
                    maxPlayers < 2 ||
                    maxPlayers > 10
                ) {

                    await interaction.reply({
                        content:
                            '❌ 募集人数は2〜10人で指定してください。',
                        ephemeral: true
                    });

                    return;
                }

                const startTime =
                    parseTime(
                        startTimeText
                    );

                if (!startTime) {

                    await interaction.reply({
                        content:
                            '❌ 開始時刻の形式が正しくありません。\n例：21:30',
                        ephemeral: true
                    });

                    return;
                }

                const endTime =
                    parseEndTime(
                        endTimeText,
                        startTime
                    );

                if (!endTime) {

                    await interaction.reply({
                        content:
                            '❌ 終了時刻の形式が正しくありません。\n例：23:00',
                        ephemeral: true
                    });

                    return;
                }

                if (
                    endTime <= startTime
                ) {

                    await interaction.reply({
                        content:
                            '❌ 終了時刻は開始時刻より後にしてください。',
                        ephemeral: true
                    });

                    return;
                }

                // ==========================
                // 通話選択
                // ==========================

                const voiceSelect =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `recruitment_voice_${interaction.user.id}`
                        )
                        .setPlaceholder(
                            '通話の有無を選択してください'
                        )
                        .setMinValues(1)
                        .setMaxValues(1)
                        .addOptions(

                            {
                                label:
                                    '通話あり（聞き専⭕️）',
                                description:
                                    '聞き専での参加OK',
                                value:
                                    'voice_yes_listen_ok'
                            },

                            {
                                label:
                                    '通話あり（聞き専❌）',
                                description:
                                    '聞き専での参加不可',
                                value:
                                    'voice_yes_listen_ng'
                            },

                            {
                                label:
                                    '通話なし',
                                description:
                                    '通話を使用しない募集',
                                value:
                                    'voice_no'
                            }
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            voiceSelect
                        );

                interaction.client
                    .recruitmentDrafts
                    .set(
                        interaction.user.id,
                        {
                            type,
                            content,
                            maxPlayers,
                            startTime,
                            endTime
                        }
                    );

                await interaction.reply({
                    content:
                        '通話の有無を選択してください。',
                    components: [
                        row
                    ],
                    ephemeral: true
                });

                return;
            }

            // ==========================
            // 通話選択
            // ==========================

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId.startsWith(
                    'recruitment_voice_'
                )
            ) {

                const userId =
                    interaction.customId.replace(
                        'recruitment_voice_',
                        ''
                    );

                if (
                    interaction.user.id !==
                    userId
                ) {
                    return;
                }

                const draft =
                    interaction.client
                        .recruitmentDrafts
                        .get(userId);

                if (!draft) {

                    await interaction.update({
                        content:
                            '❌ 募集情報の有効期限が切れています。もう一度 /募集 を実行してください。',
                        components: []
                    });

                    return;
                }

                const voice =
                    interaction.values[0];

                draft.voice =
                    voice;

                interaction.client
                    .recruitmentDrafts
                    .set(
                        userId,
                        draft
                    );

                // ==========================
                // パワーロールだけ表示
                // ==========================

                const powerRoles =
                    getPowerRoles(
                        interaction.guild
                    );

                const roleOptions = [
                    {
                        label:
                            '@everyone',
                        description:
                            'サーバー全員を募集対象にする',
                        value:
                            'everyone'
                    }
                ];

                for (
                    const item
                    of powerRoles
                ) {

                    roleOptions.push({
                        label:
                            item.label,
                        description:
                            `ロール「${item.role.name}」を持つ人を募集対象にする`,
                        value:
                            `role_${item.role.id}`
                    });
                }

                if (
                    roleOptions.length === 1
                ) {

                    await interaction.update({
                        content:
                            '❌ 募集対象にできるパワーロールが見つかりません。\nサーバーのロール名を確認してください。',
                        components: []
                    });

                    return;
                }

                const roleSelect =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `recruitment_roles_${userId}`
                        )
                        .setPlaceholder(
                            '募集対象のロールを選択'
                        )
                        .setMinValues(1)
                        .setMaxValues(
                            Math.min(
                                roleOptions.length,
                                6
                            )
                        )
                        .addOptions(
                            roleOptions
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            roleSelect
                        );

                await interaction.update({
                    content:
                        '募集対象のロールを選択してください。\n' +
                        '複数選択できます。\n' +
                        '@everyoneを選択するとサーバー全員が対象になります。',
                    components: [
                        row
                    ]
                });

                return;
            }

            // ==========================
            // ロール選択
            // ==========================

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId.startsWith(
                    'recruitment_roles_'
                )
            ) {

                const userId =
                    interaction.customId.replace(
                        'recruitment_roles_',
                        ''
                    );

                if (
                    interaction.user.id !==
                    userId
                ) {
                    return;
                }

                const draft =
                    interaction.client
                        .recruitmentDrafts
                        .get(userId);

                if (!draft) {

                    await interaction.update({
                        content:
                            '❌ 募集情報の有効期限が切れています。もう一度 /募集 を実行してください。',
                        components: []
                    });

                    return;
                }

                let roleIds = [];

                // @everyoneが選ばれている場合
                // ロール条件なし
                if (
                    interaction.values.includes(
                        'everyone'
                    )
                ) {

                    roleIds = [];

                } else {

                    roleIds =
                        interaction.values
                            .filter(
                                value =>
                                    value.startsWith(
                                        'role_'
                                    )
                            )
                            .map(
                                value =>
                                    value.replace(
                                        'role_',
                                        ''
                                    )
                            );

                    // 念のため6ロール以外が
                    // 入っていないか確認
                    const allowedRoles =
                        getPowerRoles(
                            interaction.guild
                        ).map(
                            item =>
                                item.role.id
                        );

                    roleIds =
                        roleIds.filter(
                            id =>
                                allowedRoles.includes(
                                    id
                                )
                        );
                }

                await interaction.update({
                    content:
                        '✅ 募集を作成しています...',
                    components: []
                });

                await createRecruitment(
                    interaction,
                    {
                        ...draft,
                        roleIds
                    }
                );

                interaction.client
                    .recruitmentDrafts
                    .delete(userId);

                await interaction.editReply({
                    content:
                        '✅ 募集を作成しました！',
                    components: []
                });

                return;
            }

            // ==========================
            // 参加
            // ==========================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'join_'
                )
            ) {

                const id =
                    interaction.customId.replace(
                        'join_',
                        ''
                    );

                const recruitment =
                    recruitments.get(id);

                if (!recruitment) {

                    await interaction.reply({
                        content:
                            '❌ この募集は見つかりません。',
                        ephemeral: true
                    });

                    return;
                }

                if (
                    recruitment.closed
                ) {

                    await interaction.reply({
                        content:
                            '❌ この募集は終了しています。',
                        ephemeral: true
                    });

                    return;
                }

                if (
                    recruitment.participants
                        .includes(
                            interaction.user.id
                        )
                ) {

                    await interaction.reply({
                        content:
                            '❌ すでに参加しています。',
                        ephemeral: true
                    });

                    return;
                }

                if (
                    recruitment.participants
                        .length >=
                    recruitment.maxPlayers
                ) {

                    await interaction.reply({
                        content:
                            '❌ 定員に達しています。',
                        ephemeral: true
                    });

                    return;
                }

                // ==========================
                // ロール条件
                // ==========================

                if (
                    recruitment.roleIds.length > 0
                ) {

                    const member =
                        await interaction.guild
                            .members
                            .fetch(
                                interaction.user.id
                            );

                    const hasRole =
                        recruitment.roleIds
                            .some(
                                roleId =>
                                    member.roles.cache
                                        .has(
                                            roleId
                                        )
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

                recruitment.participants.push(
                    interaction.user.id
                );

                await interaction.deferUpdate();

                if (
                    recruitment.participants
                        .length >=
                    recruitment.maxPlayers
                ) {

                    await closeRecruitment(
                        recruitment,
                        '定員に達しました'
                    );

                } else {

                    await updateRecruitmentMessage(
                        recruitment
                    );
                }

                return;
            }

            // ==========================
            // 退出
            // ==========================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'leave_'
                )
            ) {

                const id =
                    interaction.customId.replace(
                        'leave_',
                        ''
                    );

                const recruitment =
                    recruitments.get(id);

                if (!recruitment) {

                    await interaction.reply({
                        content:
                            '❌ この募集は見つかりません。',
                        ephemeral: true
                    });

                    return;
                }

                if (
                    recruitment.closed
                ) {

                    await interaction.reply({
                        content:
                            '❌ この募集は終了しています。',
                        ephemeral: true
                    });

                    return;
                }

                if (
                    interaction.user.id ===
                    recruitment.hostId
                ) {

                    await interaction.reply({
                        content:
                            '❌ 主催者は退出できません。終了する場合は「募集終了」を押してください。',
                        ephemeral: true
                    });

                    return;
                }

                const index =
                    recruitment.participants
                        .indexOf(
                            interaction.user.id
                        );

                if (index === -1) {

                    await interaction.reply({
                        content:
                            '❌ 参加していません。',
                        ephemeral: true
                    });

                    return;
                }

                recruitment.participants
                    .splice(
                        index,
                        1
                    );

                await interaction.deferUpdate();

                await updateRecruitmentMessage(
                    recruitment
                );

                return;
            }

            // ==========================
            // 募集終了
            // ==========================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'end_'
                )
            ) {

                const id =
                    interaction.customId.replace(
                        'end_',
                        ''
                    );

                const recruitment =
                    recruitments.get(id);

                if (!recruitment) {

                    await interaction.reply({
                        content:
                            '❌ この募集は見つかりません。',
                        ephemeral: true
                    });

                    return;
                }

                if (
                    interaction.user.id !==
                    recruitment.hostId
                ) {

                    await interaction.reply({
                        content:
                            '❌ 募集を終了できるのは主催者だけです。',
                        ephemeral: true
                    });

                    return;
                }

                await interaction.deferUpdate();

                await closeRecruitment(
                    recruitment,
                    '主催者が募集を終了しました'
                );

                return;
            }

        } catch (error) {

            console.error(
                'Interaction Error:',
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction
                    .reply({
                        content:
                            '❌ エラーが発生しました。',
                        ephemeral: true
                    })
                    .catch(
                        () => {}
                    );
            }
        }
    }
);

// ==============================
// Token確認
// ==============================

if (!TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN が設定されていません。'
    );

    process.exit(1);
}

// ==============================
// ログイン
// ==============================

client.login(
    TOKEN
);
