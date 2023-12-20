import { openai } from "./index.js";
import { toFile } from "openai";

export const transcribe = async (model: string, audio: string) => openai.audio.transcriptions.create({
	model: model,
	file: await toFile(Buffer.from(audio, 'base64'), 'audio.webm', {
		type: 'audio/webm',
	}),
})
