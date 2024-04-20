import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import http from "http";

import "dotenv/config";

let projects: string[] = [];

/*
#############################################
#
# SUPABASE STUFF
#
#############################################
*/
const supabaseUrl = "";
const supabaseKey = process.env.SUPABASE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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

client.once("ready", () => {
  console.log(`Logged in as ${client!.user!.tag}!`);
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
