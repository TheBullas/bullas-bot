import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  GuildMemberRoleManager,
} from "discord.js";
import express from "express";
import http from "http";
import { v4 } from "uuid";

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

client.once("ready", async () => {
  console.log(`Logged in as ${client!.user!.tag}!`);

  const guild = client.guilds.cache.get("1228994421966766141");
  if (guild) {
    await guild.commands.create({
      name: "wankme",
      description: "Generate a UUID and pass Discord user ID to Vercel site",
    });
    await guild.commands.create({
      name: "honey",
      description: "Check how much honey you have",
    });
    await guild.commands.create({
      name: "team",
      description: "Choose your team",
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "wankme") {
    const userId = interaction.user.id;
    const uuid = v4();

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
      await interaction.reply("An error occurred while generating the token.");
    } else {
      const vercelUrl = `${process.env.VERCEL_URL}/?token=${uuid}&discord=${userId}`;
      await interaction.reply({
        content: `Hey ${interaction.user.username}, to link your Discord account to your address click this link: \n\n${vercelUrl} `,
        ephemeral: true,
      });
    }
  }

  if (interaction.commandName === "honey") {
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
      const honeyEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${interaction.user.username}'s Honey`)
        .setDescription(`You have ${data.points} honey. 🍯`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({
        embeds: [honeyEmbed],
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

    await interaction.reply({
      content: "You have joined the Bullas team!",
      ephemeral: true,
    });
  } else if (interaction.customId === "bearButton") {
    // Remove the "Bull" role if the user has it
    if (roles.cache.has(BULL_ROLE_ID)) {
      await roles.remove(bullRole);
    }

    // Add the "Bear" role to the user
    await roles.add(bearRole);

    await interaction.reply({
      content: "You have joined the Beras team!",
      ephemeral: true,
    });
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
