import { SpeechCreateParams } from "openai/resources/audio/speech.mjs";
import { openai } from "./index.js";

export const synthesize = (
	model: string,
	text: string,
	voice: SpeechCreateParams['voice'],
	format: SpeechCreateParams['response_format'] = 'opus',
) => openai.audio.speech.create({
	model: model,
	response_format: format,
	voice: voice,
	input: text,
})
