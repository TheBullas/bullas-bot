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
  GuildMember,
  GuildMemberRoleManager,
} from "discord.js";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { v4 } from "uuid";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import "dotenv/config";
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
  return member?.roles.cache.some((role) => ADMIN_ROLE_IDS.includes(role.id));
}

client.once("ready", async () => {
  console.log(`Logged in as ${client!.user!.tag}!`);

  const guild = client.guilds.cache.get("1228994421966766141");
  if (guild) {
    const commands = await guild.commands.fetch();
    const honeyCommand = commands.find((command) => command.name === "honey");
    if (honeyCommand) {
      await guild.commands.delete(honeyCommand.id);
      console.log("Deleted /honey command");
    }

    await guild.commands.create({
      name: "wankme",
      description: "Generate a UUID and pass Discord user ID to Vercel site",
    });
    await guild.commands.create({
      name: "moola",
      description: "Check how much moola you have",
    });
    await guild.commands.create({
      name: "team",
      description: "Choose your team",
    });
    await guild.commands.create({
      name: "warstatus",
      description: "Show war status",
    });
    await guild.commands.create({
      name: "transfer",
      description: "Transfer moola to another user",
      options: [
        {
          name: "user",
          description: "The user to transfer moola to",
          type: 6, // 6 represents the USER type
          required: true,
        },
        {
          name: "amount",
          description: "The amount of moola to transfer",
          type: 10, // 10 represents the NUMBER type
          required: true,
        },
      ],
    });
    await guild.commands.create({
      name: "leaderboard",
      description: "Show the leaderboard with top users and their points",
    });
    await guild.commands.create({
      name: "snapshot",
      description:
        "Get a snapshot of the top 500 addresses from the winning team",
    });
    await guild.commands.create({
      name: "fine",
      description: "Fine a user by removing points",
      options: [
        {
          name: "user",
          description: "The user to fine",
          type: 6, // 6 represents the USER type
          required: true,
        },
        {
          name: "amount",
          description: "The amount of points to remove",
          type: 10, // 10 represents the NUMBER type
          required: true,
        },
      ],
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

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
    const actionRow = new ActionRowBuilder().addComponents(
      bullButton,
      bearButton
    );

    // Send the embed with the action row
    await interaction.reply({ embeds: [embed], components: [actionRow] });
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
        const user = await client.users.fetch(entry.discord_id);
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

    await interaction.deferReply(); // Defer the reply as this operation might take some time

    try {
      // Get the total points for each team
      const [bullasData, berasData] = await Promise.all([
        supabase.rpc("sum_points_for_team", { team_name: "bullas" }),
        supabase.rpc("sum_points_for_team", { team_name: "beras" }),
      ]);

      const bullasPoints = bullasData.data ?? 0;
      const berasPoints = berasData.data ?? 0;

      // Determine the winning team
      const winningTeam = bullasPoints > berasPoints ? "bullas" : "beras";

      // Fetch top 500 addresses from the winning team
      const { data: topAddresses, error } = await supabase
        .from("users")
        .select("address, points")
        .eq("team", winningTeam)
        .order("points", { ascending: false })
        .limit(500);

      if (error) {
        throw new Error("Failed to fetch top addresses");
      }

      // Create CSV content
      const csvContent = topAddresses
        .map((user) => `${user.address},${user.points}`)
        .join("\n");
      const csvHeader = "address,points\n";
      const fullCsvContent = csvHeader + csvContent;

      // Get the directory of the current module
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // Write to a temporary file
      const tempDir = join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
      const filePath = join(tempDir, `top_500_${winningTeam}.csv`);
      fs.writeFileSync(filePath, fullCsvContent);

      // Upload the file as an attachment
      await interaction.editReply({
        content: `Here's the snapshot of the top 500 addresses from the winning team (${winningTeam}):`,
        files: [filePath],
      });

      // Delete the temporary file
      fs.unlinkSync(filePath);
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
      await interaction.reply("Please provide a valid user and a positive amount.");
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
        await interaction.reply("The user doesn't have enough points for this fine.");
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

      await interaction.reply(`Successfully fined <@${targetUser.id}> ${amount} points. Their new balance is ${updatedPoints} points.`);
    } catch (error) {
      console.error("Error handling fine command:", error);
      await interaction.reply("An error occurred while processing the fine command.");
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
