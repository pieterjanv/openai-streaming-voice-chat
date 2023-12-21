import { openai } from "./index.js";
import { toFile } from "openai";

export const transcribe = async (model: string, audio: string, audioFormat: string) => openai.audio.transcriptions.create({
	model: model,
	file: await toFile(Buffer.from(audio, 'base64'), `audio.${audioFormat}`, {
		type: `audio/${audioFormat}`,
	}),
})
