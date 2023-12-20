import { SpeechCreateParams } from "openai/resources/audio/speech.mjs";
import { openai } from "./index.js";

export const synthesize = (model: string, text: string, voice: SpeechCreateParams['voice']) => openai.audio.speech.create({
	model: model,
	response_format: 'opus',
	voice: voice,
	input: text,
})
