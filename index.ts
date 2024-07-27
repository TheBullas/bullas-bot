import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import Decimal from "decimal.js";
import {
  ActionRowBuilder,
  APIInteractionGuildMember,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Guild,
  GuildMember,
  GuildMemberRoleManager,
  REST,
  Role,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import "dotenv/config";
import express from "express";
import fs from "fs";
import http from "http";
import { scheduleJob } from "node-schedule";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { v4 } from "uuid";
import { Database } from "./types/supabase";

let projects: string[] = [];

/*
#############################################
#
# SUPABASE STUFF
#
#############################################
*/
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

/*
#############################################
#
# DISCORD STUFF
#
#############################################
*/
const discordBotToken = process.env.DISCORD_BOT_TOKEN;
const channelId = "";
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Define permissioned roles
const ADMIN_ROLE_IDS = [
  "1230906668066406481",
  "1230195803877019718",
  "1230906465334853785",
  "1234239721165815818",
];

// Helper function to check if user has admin role
function hasAdminRole(member: GuildMember | APIInteractionGuildMember | null) {
  if (member && "roles" in member) {
    return member.roles.cache.some((role: Role) =>
      ADMIN_ROLE_IDS.includes(role.id)
    );
  }
  return false;
}

// New constants for role management
const WHITELIST_ROLE_ID = "1263470313300295751";
const MOOLALIST_ROLE_ID = "1263470568536014870";
const FREE_MINT_ROLE_ID = "1263470790314164325";

let WHITELIST_MINIMUM = 100; // Initial minimum, can be updated

// New function to get team points
async function getTeamPoints() {
  const [bullasData, berasData] = await Promise.all([
    supabase.rpc("sum_points_for_team", { team_name: "bullas" }),
    supabase.rpc("sum_points_for_team", { team_name: "beras" }),
  ]);

  return {
    bullas: bullasData.data ?? 0,
    beras: berasData.data ?? 0,
  };
}

// New function to get top players
async function getTopPlayers(team: string, limit: number) {
  const { data, error } = await supabase
    .from("users")
    .select("discord_id, address, points")
    .eq("team", team)
    .order("points", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

// New function to create CSV content
function createCSV(data: any[], includeDiscordId: boolean = false) {
  const header = includeDiscordId
    ? "discord_id,address,points\n"
    : "address,points\n";
  const content = data
    .map((user) =>
      includeDiscordId
        ? `${user.discord_id},${user.address},${user.points}`
        : `${user.address},${user.points}`
    )
    .join("\n");
  return header + content;
}

// New function to save CSV file
async function saveCSV(content: string, filename: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const tempDir = join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  const filePath = join(tempDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Improve the updateRoles function
async function updateRoles(guild: Guild) {
  console.log("Starting role update process...");
  const whitelistRole = guild.roles.cache.get(WHITELIST_ROLE_ID);

  if (!whitelistRole) {
    console.error("Whitelist role not found. Aborting role update.");
    return;
  }

  const { data: allPlayers, error } = await supabase
    .from("users")
    .select("discord_id, points")
    .gte("points", WHITELIST_MINIMUM);

  if (error) {
    console.error("Error fetching eligible players:", error);
    return;
  }

  console.log(`Updating roles for ${allPlayers.length} eligible players...`);

  for (const player of allPlayers) {
    try {
      const member = await guild.members.fetch({
        user: player.discord_id,
        force: true,
      });
      if (!member) {
        console.log(`Member not found for Discord ID: ${player.discord_id}`);
        continue;
      }

      // Whitelist role
      await member.roles.add(whitelistRole);
      console.log(`Added Whitelist role to user: ${player.discord_id}`);
    } catch (error) {
      console.error(
        `Error updating roles for user ${player.discord_id}:`,
        error
      );
    }
  }

  console.log("Role update process completed.");
}

// Improve the cron job scheduling
const roleUpdateJob = scheduleJob("0 */6 * * *", async () => {
  console.log("Running scheduled role update job...");
  const guild = client.guilds.cache.get("1228994421966766141"); // Replace with your actual guild ID
  if (guild) {
    await updateRoles(guild);
    console.log("Scheduled role update completed");
  } else {
    console.error("Guild not found for scheduled role update");
  }
});

// Define your commands
const commands = [
  new SlashCommandBuilder()
    .setName("updateroles")
    .setDescription("Manually update roles"),
  new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("Transfer points to another user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to transfer points to")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("The amount of points to transfer")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("wankme")
    .setDescription("Link your Discord account to your address"),
  new SlashCommandBuilder()
    .setName("moola")
    .setDescription("Check your moola balance"),
  new SlashCommandBuilder().setName("team").setDescription("Choose your team"),
  new SlashCommandBuilder()
    .setName("warstatus")
    .setDescription("Check the current war status"),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the leaderboard"),
  new SlashCommandBuilder()
    .setName("snapshot")
    .setDescription("Take a snapshot of the current standings"),
  new SlashCommandBuilder()
    .setName("fine")
    .setDescription("Fine a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to fine")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("The amount to fine")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("updatewhitelistminimum")
    .setDescription("Update the whitelist minimum")
    .addIntegerOption((option) =>
      option
        .setName("minimum")
        .setDescription("The new minimum value")
        .setRequired(true)
    ),
];

client.once("ready", async () => {
  console.log("Bot is ready!");

  // Register slash commands
  const rest = new REST({ version: "10" }).setToken(discordBotToken!);

  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error refreshing application (/) commands:", error);
  }
});

// Add a manual trigger for role updates (for testing)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "updateroles") {
    if (!hasAdminRole(interaction.member)) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    const guild = interaction.guild;
    if (guild) {
      await updateRoles(guild);
      await interaction.editReply("Roles have been manually updated.");
    } else {
      await interaction.editReply("Failed to update roles: Guild not found.");
    }
  }

  if (interaction.commandName === "transfer") {
    if (!hasAdminRole(interaction.member)) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.get("amount")?.value as number;

    if (!targetUser || !amount) {
      await interaction.reply("Please provide a valid user and amount.");
      return;
    }

    const { data: senderData, error: senderError } = await supabase
      .from("users")
      .select("*")
      .eq("discord_id", userId)
      .single();

    if (senderError || !senderData) {
      console.error("Error fetching sender:", senderError);
      await interaction.reply("An error occurred while fetching the sender.");
      return;
    }

    if (senderData.points < amount) {
      await interaction.reply("Insufficient points to transfer.");
      return;
    }

    const { data: receiverData, error: receiverError } = await supabase
      .from("users")
      .select("*")
      .eq("discord_id", targetUser.id)
      .single();

    if (receiverError) {
      console.error("Error fetching receiver:", receiverError);
      await interaction.reply("An error occurred while fetching the receiver.");
      return;
    }

    if (!receiverData) {
      await interaction.reply("The specified user does not exist.");
      return;
    }

    const senderPoints = new Decimal(senderData.points);
    const receiverPoints = new Decimal(receiverData.points);
    const transferAmount = new Decimal(amount);

    const updatedSenderPoints = senderPoints.minus(transferAmount);
    const updatedReceiverPoints = receiverPoints.plus(transferAmount);

    const { data: senderUpdateData, error: senderUpdateError } = await supabase
      .from("users")
      .update({ points: updatedSenderPoints.toNumber() })
      .eq("discord_id", userId);

    if (senderUpdateError) {
      console.error("Error updating sender points:", senderUpdateError);
      await interaction.reply(
        "An error occurred while updating sender points."
      );
      return;
    }

    const { data: receiverUpdateData, error: receiverUpdateError } =
      await supabase
        .from("users")
        .update({ points: updatedReceiverPoints.toNumber() })
        .eq("discord_id", targetUser.id);

    if (receiverUpdateError) {
      console.error("Error updating receiver points:", receiverUpdateError);
      await interaction.reply(
        "An error occurred while updating receiver points."
      );
      return;
    }

    await interaction.reply(
      `Successfully transferred ${amount} points to <@${targetUser.id}>.`
    );
  }

  if (interaction.commandName === "wankme") {
    const userId = interaction.user.id;
    const uuid = v4();

    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("discord_id", userId)
      .single();

    if (userData) {
      await interaction.reply(
        `You have already linked your account. Your linked account: \`${userData.address}\``
      );
      return;
    }

    const { data, error } = await supabase
      .from("tokens")
      .insert({ token: uuid, discord_id: userId, used: false })
      .single();

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("Some title")
      .setDescription("Some description");

    if (error) {
      console.error("Error inserting token:", error);
      await interaction.reply({
        content: "An error occurred while generating the token.",
        ephemeral: true,
      });
    } else {
      const vercelUrl = `${process.env.VERCEL_URL}/game?token=${uuid}&discord=${userId}`;
      await interaction.reply({
        content: `Hey ${interaction.user.username}, to link your Discord account to your address click this link: \n\n${vercelUrl} `,
        ephemeral: true,
      });
    }
  }

  if (interaction.commandName === "moola") {
    const userId = interaction.user.id;
    const uuid = v4();

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("discord_id", userId)
      .single();

    if (error) {
      console.error("Error fetching user:", error);
      await interaction.reply("An error occurred while fetching the user.");
    } else {
      const moolaEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${interaction.user.username}'s moola`)
        .setDescription(`You have ${data.points} moola. 🍯`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({
        embeds: [moolaEmbed],
      });
    }
  }

  if (interaction.commandName === "team") {
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle("Choose Your Team")
      .setDescription(
        "Are you a bulla or a bera? Click the button to choose your team and get the corresponding role."
      )
      .setColor("#0099ff");

    // Create the buttons
    const bullButton = new ButtonBuilder()
      .setCustomId("bullButton")
      .setLabel("🐂 Bullas")
      .setStyle(ButtonStyle.Primary);

    const bearButton = new ButtonBuilder()
      .setCustomId("bearButton")
      .setLabel("🐻 Beras")
      .setStyle(ButtonStyle.Primary);

    // Create the action row and add the buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      bullButton,
      bearButton
    );

    // Send the embed with the action row
    await interaction.reply({
      embeds: [embed],
      components: [actionRow as any],
    });
  }

  if (interaction.commandName === "warstatus") {
    try {
      const [bullasData, berasData] = await Promise.all([
        supabase.rpc("sum_points_for_team", { team_name: "bullas" }),
        supabase.rpc("sum_points_for_team", { team_name: "beras" }),
      ]);

      const bullas = bullasData.data ?? 0;
      const beras = berasData.data ?? 0;

      const embed = new EmbedBuilder()
        .setTitle("🏆 Moola War Status")
        .setDescription(`The battle between the Bullas and Beras rages on!`)
        .addFields(
          {
            name: "🐂 Bullas",
            value: `moola (mL): ${bullas}`,
            inline: true,
          },
          {
            name: "🐻 Beras",
            value: `moola (mL): ${beras}`,
            inline: true,
          }
        )
        .setColor("#FF0000");
      // .setTimestamp()
      // .setFooter({
      //   text: "May the best team win!",
      //   // iconURL: "https://i.imgur.com/AfFp7pu.png",
      // });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Error fetching war status:", error);
      await interaction.reply(
        "An error occurred while fetching the war status."
      );
    }
  }

  if (interaction.commandName === "leaderboard") {
    try {
      const { data: leaderboardData, error } = await supabase
        .from("users")
        .select("discord_id, points")
        .order("points", { ascending: false })
        .limit(10)
        .not("discord_id", "is", null);

      if (error) {
        console.error("Error fetching leaderboard data:", error);
        await interaction.reply(
          "An error occurred while fetching the leaderboard data."
        );
        return;
      }

      const leaderboardEmbed = new EmbedBuilder()
        .setTitle("🏆 Leaderboard")
        .setColor("#FFD700");

      for (const [index, entry] of leaderboardData.entries()) {
        const user = await client.users.fetch(entry.discord_id as string);
        const userMention = user ? `<@${user.id}>` : "Unknown User";

        leaderboardEmbed.addFields({
          name: `${index + 1}. ${user.username}`,
          value: ` 🍯 ${entry.points} mL`,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [leaderboardEmbed] });
    } catch (error) {
      console.error("Error handling leaderboard command:", error);
      await interaction.reply(
        "An error occurred while processing the leaderboard command."
      );
    }
  }

  if (interaction.commandName === "snapshot") {
    if (!hasAdminRole(interaction.member)) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const teamPoints = await getTeamPoints();
      const winningTeam =
        teamPoints.bullas > teamPoints.beras ? "bullas" : "beras";
      const losingTeam = winningTeam === "bullas" ? "beras" : "bullas";

      const winningTopPlayers = await getTopPlayers(winningTeam, 2000);
      const losingTopPlayers = await getTopPlayers(losingTeam, 700);
      const allPlayers = await getTopPlayers(
        winningTeam,
        Number.MAX_SAFE_INTEGER
      );
      allPlayers.push(
        ...(await getTopPlayers(losingTeam, Number.MAX_SAFE_INTEGER))
      );
      allPlayers.sort((a, b) => b.points - a.points);

      const winningCSV = createCSV(winningTopPlayers);
      const losingCSV = createCSV(losingTopPlayers);
      const allCSV = createCSV(allPlayers, true);

      const winningFile = await saveCSV(
        winningCSV,
        `top_2000_${winningTeam}.csv`
      );
      const losingFile = await saveCSV(losingCSV, `top_700_${losingTeam}.csv`);
      const allFile = await saveCSV(allCSV, `all_players.csv`);

      await interaction.editReply({
        content: `Here are the snapshot files:`,
        files: [winningFile, losingFile, allFile],
      });

      // Delete temporary files
      fs.unlinkSync(winningFile);
      fs.unlinkSync(losingFile);
      fs.unlinkSync(allFile);
    } catch (error) {
      console.error("Error handling snapshot command:", error);
      await interaction.editReply(
        "An error occurred while processing the snapshot command."
      );
    }
  }

  if (interaction.commandName === "fine") {
    if (!hasAdminRole(interaction.member)) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.get("amount")?.value as number;

    if (!targetUser || !amount || amount <= 0) {
      await interaction.reply(
        "Please provide a valid user and a positive amount."
      );
      return;
    }

    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("discord_id", targetUser.id)
        .single();

      if (userError || !userData) {
        await interaction.reply("User not found or an error occurred.");
        return;
      }

      const currentPoints = new Decimal(userData.points);
      const fineAmount = new Decimal(amount);

      if (currentPoints.lessThan(fineAmount)) {
        await interaction.reply(
          "The user doesn't have enough points for this fine."
        );
        return;
      }

      const updatedPoints = currentPoints.minus(fineAmount);

      const { error: updateError } = await supabase
        .from("users")
        .update({ points: updatedPoints.toNumber() })
        .eq("discord_id", targetUser.id);

      if (updateError) {
        throw new Error("Failed to update user points");
      }

      await interaction.reply(
        `Successfully fined <@${targetUser.id}> ${amount} points. Their new balance is ${updatedPoints} points.`
      );
    } catch (error) {
      console.error("Error handling fine command:", error);
      await interaction.reply(
        "An error occurred while processing the fine command."
      );
    }
  }

  if (interaction.commandName === "updatewhitelistminimum") {
    if (!hasAdminRole(interaction.member)) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const newMinimum = interaction.options.get("minimum")?.value as number;
    if (!newMinimum || newMinimum <= 0) {
      await interaction.reply(
        "Please provide a valid positive integer for the new minimum."
      );
      return;
    }

    WHITELIST_MINIMUM = newMinimum;
    await interaction.reply(
      `Whitelist minimum updated to ${WHITELIST_MINIMUM} MOOLA.`
    );

    // Trigger an immediate role update
    const guild = interaction.guild;
    if (guild) {
      await updateRoles(guild);
      await interaction.followUp(
        "Roles have been updated based on the new minimum."
      );
    }
  }
});

// Handle button interactions
client.on("interactionCreate", async (interaction) => {
  // Replace 'BULL_ROLE_ID' and 'BEAR_ROLE_ID' with the actual role IDs
  const BULL_ROLE_ID = "1230207362145452103";
  const BEAR_ROLE_ID = "1230207106896892006";
  const member = interaction.member;

  if (!interaction.isButton()) return;
  if (!member || !interaction.guild) return;

  const bullRole = interaction.guild.roles.cache.get(BULL_ROLE_ID);
  const bearRole = interaction.guild.roles.cache.get(BEAR_ROLE_ID);

  if (!bearRole || !bullRole) return;

  const roles = member.roles as GuildMemberRoleManager;

  if (interaction.customId === "bullButton") {
    // Remove the "Bear" role if the user has it
    if (roles.cache.has(BEAR_ROLE_ID)) {
      await roles.remove(bearRole);
    }

    // Add the "Bull" role to the user
    await roles.add(bullRole);

    const { data, error } = await supabase
      .from("users")
      .update({ team: "bullas" })
      .eq("discord_id", member.user.id);

    await interaction.reply({
      content: "You have joined the Bullas team!",
      ephemeral: true,
    });

    // Delete the original message
    await interaction.message.delete();
  } else if (interaction.customId === "bearButton") {
    // Remove the "Bull" role if the user has it
    if (roles.cache.has(BULL_ROLE_ID)) {
      await roles.remove(bullRole);
    }

    // Add the "Bear" role to the user
    await roles.add(bearRole);

    const { data, error } = await supabase
      .from("users")
      .update({ team: "beras" })
      .eq("discord_id", member.user.id);

    await interaction.reply({
      content: "You have joined the Beras team!",
      ephemeral: true,
    });

    // Delete the original message
    await interaction.message.delete();
  }
});

client.login(discordBotToken);

/*
#############################################
#
# REST SERVER
#
#############################################
*/
const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);

const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
