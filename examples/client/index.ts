import { config } from 'dotenv';
import * as fs from 'fs';

config({ path: '../../.env' });

// the six phases of parsing data corresponding to a single chunk
enum ParseChunkPhase {
	queryLength = 0,
	query = 1,
	responseTextLength = 2,
	responseText = 3,
	responseAudioLength = 4,
	responseAudio = 5,
}

// length of the enum
const parseChunkPhaseLength = (Object.values(ParseChunkPhase).reduce(
	(a, b) => isNaN(Number(b)) ? a + 1 : a, 0)
);

run();

async function run() {

	const apiHost = `http://${process.env.HOST}:${process.env.PORT}`;

	const body = {
		chat: [],
		input: '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',
		outputFormat: 'mp3',
	}

	// fetch the response
	const response = await fetch(`${apiHost}/voice`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!(response.ok && response.body)) {
		response.json().then(console.error);
		return;
	}

	// initialization
	let phase: ParseChunkPhase = ParseChunkPhase.queryLength;
	let fragment: ArrayBuffer = new ArrayBuffer(0);
	let queryLength = 0;
	let responseTextLength = 0;
	let responseAudioLength = 0;
	const responseAudioFileUrls: string[] = [];
	let assistantMessageText = '';
	let partIndex = 0;

	// Get a reader for the response body stream
	const reader = response.body.getReader();

	const read = async () => {

		const { value, done } = await reader.read();

		if (done) {
			return;
		}

		// initialization
		let byteLength = value.buffer.byteLength;
		let bytesRead = 0;
		let query = '';
		let responseText = '';
		const start = Date.now();

		// parse the body stream's current value, iterating over the phases
		// fragmented data carries over between read values
		while (bytesRead < byteLength && Date.now() - start < 1000) {
			switch (phase) {
				case ParseChunkPhase.queryLength:
					// get the query length
					({ fragment, phase, bytesRead } = processChunkPart(
						phase,
						fragment,
						value.buffer,
						bytesRead,
						4,
						(chunkPart) => {
							queryLength = (new Uint32Array(chunkPart))[0];
						},
					));
					break;
				case ParseChunkPhase.query:
					// get the query
					({ fragment, phase, bytesRead } = processChunkPart(
						phase,
						fragment,
						value.buffer,
						bytesRead,
						queryLength,
						(chunkPart) => {
							query = new TextDecoder().decode(chunkPart);
						},
					));
					break;
				case ParseChunkPhase.responseTextLength:
					// get the response text length
					({ fragment, phase, bytesRead } = processChunkPart(
						phase,
						fragment,
						value.buffer,
						bytesRead,
						4,
						(chunkPart) => {
							responseTextLength = (new Uint32Array(chunkPart))[0];
						},
					));
					break;
				case ParseChunkPhase.responseText:
					// get the response text
					({ fragment, phase, bytesRead } = processChunkPart(
						phase,
						fragment,
						value.buffer,
						bytesRead,
						responseTextLength,
						(chunkPart) => {
							responseText = new TextDecoder().decode(chunkPart);
							assistantMessageText += responseText;
						},
					));
					break;
				case ParseChunkPhase.responseAudioLength:
					// get the response audio length
					({ fragment, phase, bytesRead } = processChunkPart(
						phase,
						fragment,
						value.buffer,
						bytesRead,
						4,
						(chunkPart) => {
							responseAudioLength = (new Uint32Array(chunkPart))[0];
						},
					));
					break;
				case ParseChunkPhase.responseAudio:
					// get the response audio
					({ fragment, phase, bytesRead } = processChunkPart(
						phase,
						fragment,
						value.buffer,
						bytesRead,
						responseAudioLength,
						(chunkPart) => {
							// if the audio response chunk part has been parsed, add it to the queue
							fs.promises.writeFile(`part${partIndex}.mp3`, new Uint8Array(chunkPart));

							// Or, in the browser, create file objects and play them using an audio element

							// const file = new File(
							// 	[new Uint8Array(chunkPart)],
							// 	`response.${body.outputFormat}`,
							// 	{ type: `audio/${body.outputFormat}` },
							// );
							// const url = URL.createObjectURL(file);
							// responseAudioFileUrls.push(url);
						},
					));
					break;
			}
		}

		// start the next read
		read();
	}

	// start the first read
	read();
};

// parse a chunk part
// only advance the phase if the chunk part is fully parsed
function processChunkPart(
	phase: ParseChunkPhase,
	fragment: ArrayBuffer,
	buffer: ArrayBuffer,
	offset: number,
	length: number,
	callback: (chunkPart: ArrayBuffer) => void,
): { fragment: ArrayBuffer, phase: ParseChunkPhase, bytesRead: number } {
	const { chunkPart, remainder } = combineFragments(
		fragment,
		buffer,
		offset,
		length,
	);
	const bytesRead = offset + chunkPart.byteLength;
	fragment = remainder > 0 ? chunkPart : new ArrayBuffer(0);
	if (remainder > 0) {
		return { fragment, phase, bytesRead };
	}
	callback(chunkPart);
	phase = (phase + 1) % parseChunkPhaseLength;
	return { fragment, phase, bytesRead }
}

// add part of the buffer to the fragment
function combineFragments(
	oldFragment: ArrayBuffer,
	buffer: ArrayBuffer,
	offset: number,
	length: number
): { chunkPart: ArrayBuffer, remainder: number } {
	const newFragment = buffer.slice(offset, offset + length - oldFragment.byteLength);
	const chunkPart = new Uint8Array(oldFragment.byteLength + newFragment.byteLength);
	chunkPart.set(new Uint8Array(oldFragment), 0);
	chunkPart.set(new Uint8Array(newFragment), oldFragment.byteLength);
	const remainder = length - chunkPart.byteLength;
	return { chunkPart: chunkPart.buffer, remainder };
}
