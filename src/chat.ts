import type { ChatCompletionStream } from "openai/lib/ChatCompletionStream.mjs";
import type { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from "openai/resources/index.mjs";
import { openai } from "./index.js";

type Chat = Array<
	| ChatCompletionSystemMessageParam
	| ChatCompletionUserMessageParam
	| ChatCompletionAssistantMessageParam
>;

export const getStream = async (model: string, chat: Chat): Promise<ChatCompletionStream> => {

	const stream = openai.beta.chat.completions.stream({
		model: model,
		messages: chat,
		stream: true,
		max_tokens: Number(process.env.MAX_RESPONSE_TOKENS || 2000),
	});

	if (!stream) throw new Error('Could not create stream');

	return stream;
};
