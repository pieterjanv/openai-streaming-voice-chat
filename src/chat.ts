import type { ChatCompletionStream } from "openai/lib/ChatCompletionStream.mjs";
import type { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from "openai/resources/index.mjs";
import { openai } from "./index.js";

type Chat = Array<
	| ChatCompletionSystemMessageParam
	| ChatCompletionUserMessageParam
	| ChatCompletionAssistantMessageParam
>;

let stream: ChatCompletionStream | undefined = undefined;

export const getStream = async (model: string, chat: Chat): Promise<ChatCompletionStream> => {

	if (stream) {
		await endStream();
	}

	stream = openai?.beta.chat.completions.stream({
		model: model,
		messages: chat,
		stream: true,
	});

	if (!stream) throw new Error('Could not create stream');

	return stream;
};

export const endStream = () => {
	return new Promise<void>((resolve) => {
		if (!stream) {
			resolve();
			return;
		};

		if (stream.ended) {
			stream = undefined;
			resolve();
			return;
		}

		stream.on('abort', () => {
			stream = undefined;
			resolve();
			return;
		});

		stream.controller.abort();
	});
};
