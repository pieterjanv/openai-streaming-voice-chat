import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { voiceHandler } from "./handlers/voiceHandler.js";

import 'dotenv/config';

const app = express();
app.use(cors({
	origin: process.env.CORS_ORIGIN || '*',
}));

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/voice', express.json(), voiceHandler);

app.listen({
	host: process.env.host || '127.0.0.1',
	port: process.env.PORT || 8001,
});
