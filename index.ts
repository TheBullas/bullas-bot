import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import { Client, GatewayIntentBits } from "discord.js";
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

  const guild = client.guilds.cache.get("1232478905328205865");
  if (guild) {
    await guild.commands.create({
      name: "wankme",
      description: "Generate a UUID and pass Discord user ID to Vercel site",
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

    if (error) {
      console.error("Error inserting token:", error);
      await interaction.reply("An error occurred while generating the token.");
    } else {
      const vercelUrl = `http://localhost:3000/?token=${uuid}&discord=${userId}`;
      await interaction.reply(
        `Click this link to link your Discord account: ${vercelUrl}`
      );
    }
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
