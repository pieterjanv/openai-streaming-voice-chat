import { RequestHandler, Response, response } from "express";
import { z } from 'zod';
import { transcribe } from "../transcribe.js";
import { getStream } from "../chat.js";
import { synthesize } from "../synthesize.js";
import { TtsVoice } from "../TtsVoice.js";
import { Logger } from "../Logger.js";

const defaultVoice = TtsVoice.nova;

const bodySchema = z.object({
	speakerName: z.string().max(255).default('user'),
	sttModel: z.string().max(255).default('whisper-1'),
	chatModel: z.string().max(255).default('gpt-3.5-turbo'),
	ttsModel: z.string().max(255).default('tts-1'),
	voice: z.enum([defaultVoice, ...Object.values(TtsVoice).filter(voice => voice !== defaultVoice)]).default(defaultVoice),
	chat: z.array(z.object({
		role: z.enum(['system', 'user', 'assistant'] as const),
		content: z.string().max(10e3),
		name: z.string().max(255).optional(),
	})),
	audio: z.string().max(1e6),
	audioFormat: z.string().max(255).default('webm'),
});

type Body = z.infer<typeof bodySchema>;

const logger = new Logger();

export const voiceHandler: RequestHandler = async (req, res) => {

	logger.debug('request received');

	let body: Body;
	try {
		body = bodySchema.parse(req.body);
	}
	catch (error) {
		if (error instanceof z.ZodError) {
			res.status(400).json({ errors: error.errors });
			return;
		}
		throw error;
	}

	let transcription: string;
	try {
		transcription = (await transcribe(body.sttModel, body.audio, body.audioFormat)).text;
	}
	catch (error) {
		console.error(error);
		res.status(500).json({ error });
		return;
	}
	const chat = body.chat;
	const systemPromptPostFix = process.env.SYSTEM_PROMPT_POSTFIX ?? '\n\n' + 'Use short paragraphs. Separate paragraphs in your response with a blank line.';
	const systemPrompt = chat.find((item) => item.role === 'system');
	if (systemPrompt) {
		systemPrompt.content += systemPrompt.content.endsWith(systemPromptPostFix) ? '' : systemPromptPostFix;
	}
	else {
		chat.unshift({
			role: 'system',
			content: 'Separate paragraphs in your response with a blank line.',
			name: 'system',
		});
	}
	logger.debug('chat', chat);

	chat.push({
		role: 'user',
		content: transcription,
		name: body.speakerName,
	})

	let responseIndex = 0;
	let isQueueOpen = true;
	let isQueueComplete = false;
	let nextChatResponsePartIndex = 0;
	const partTerminationString = '\n\n';
	const queueWorker = setInterval(() => {
		if (!isQueueOpen || !chatChunks.length) {
			logger.debug('queue not open or no response part');
			return;
		}
		const responsePart = chatChunks.shift();
		if (!responsePart) {
			logger.debug('no response part');
			return;
		}
		isQueueOpen = false;
		logger.debug('queue should end', isQueueComplete && chatChunks.length === 0);
		streamChatResponsePartToResponse(
			res,
			body,
			transcription,
			responsePart,
			isQueueComplete && chatChunks.length === 0,
		);
		responseIndex++;
	}, 50);

	const chatStream = (await getStream(body.chatModel, chat));
	const chatChunks: string[] = [];

	chatStream.on('content', (delta, snapshot) => {
		const lastTerminationIndex = snapshot.lastIndexOf(partTerminationString);
		if (lastTerminationIndex === -1) {
			return;
		};
		const partEndIndex = lastTerminationIndex + partTerminationString.length;
		if (partEndIndex <= nextChatResponsePartIndex) {
			return;
		}
		const chatResponsePart = snapshot.slice(nextChatResponsePartIndex, partEndIndex);
		nextChatResponsePartIndex = partEndIndex;
		logger.debug('pushing chat part');
		chatChunks.push(chatResponsePart);
	});

	chatStream.on('finalContent', async (snapshot) => {
		logger.debug('final content received');
		const chatResponsePart = snapshot.slice(nextChatResponsePartIndex, snapshot.length);
		isQueueComplete = true;
		chatChunks.push(chatResponsePart);
	});

	chatStream.on('error', (error) => {
		console.error(error);
		res.status(500).json({ error });
	});

	const streamChatResponsePartToResponse = async (
		res: Response,
		requestBody: z.infer<typeof bodySchema>,
		query: string,
		response: string,
		isFinal: boolean,
	): Promise<void> => {
	
		const chatResponsePart = response;
		logger.debug('streaming next paragraph', chatResponsePart);
	
		const readableStream = (await synthesize(
			requestBody.ttsModel,
			chatResponsePart,
			requestBody.voice,
		)).body;
		logger.debug('received audio');
	
		const audioBuffers: Buffer[] = [];
		readableStream.on('data', (chunk: Buffer) => {
			audioBuffers.push(chunk);
		});
	
		readableStream.on('close', () => {
			logger.debug('resolving', responseIndex);
		});
	
		readableStream.on('end', () => {
	
			logger.debug('response part audio ended');
			logger.debug('writing chunk');
	
			const queryBuffer = Buffer.from(query);
			const queryBufferLength = Buffer.alloc(2);
			queryBufferLength.writeUInt16LE(queryBuffer.length);
			logger.debug('query length', queryBuffer.length);
	
			const textResponseBuffer = Buffer.from(chatResponsePart);
			const textResponseBufferLength = Buffer.alloc(2);
			textResponseBufferLength.writeUInt16LE(textResponseBuffer.length);
			logger.debug('text response length', textResponseBuffer.length);
	
			const audioResponseBuffer = Buffer.concat(audioBuffers);
	
			const audioResponseBufferLength = Buffer.alloc(4);
			audioResponseBufferLength.writeUInt32LE(audioResponseBuffer.length);
			logger.debug('audio response length', audioResponseBuffer.length);
	
			const chunkBuffer = Buffer.concat([
				queryBufferLength,
				queryBuffer,
				textResponseBufferLength,
				textResponseBuffer,
				audioResponseBufferLength,
				audioResponseBuffer,
			]);
			res.write(chunkBuffer);
	
			isQueueOpen = true;
			if (isFinal) {
				logger.debug('ending response');
				clearInterval(queueWorker);
				res.end();
			};
		});
	
		readableStream.on('error', (error) => {
			console.error(error);
		});
	}
};
