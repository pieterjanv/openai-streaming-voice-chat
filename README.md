# OpenAI Streaming Voice Chat

Speak to any OpenAI's models with reduced latency.

The latency is reduced by dividing the response in paragraph-sized chunks. As soon as a chunk is fully generated, the audio is requested and added to the response. This allows the audio to be played while the next chunk is being generated.

I would love to play the audio response stream as is, but I haven't found a reliable way of doing this in the browser.


## Requirements

- Node.js
- TypeScript
- OpenAI API key


## Usage

1. `npm install`
2. Copy `.env.example` to `.env` for adding configuration.
3. Build and launch a server using `npm run serve`. This server is not suitable for production use. Refer to best practices for deploying Node.js applications.
4. Send a post request to `/voice` with a body as described below.


###	Request body

| Field | Type | Description | Default |
| --- | --- | --- | --- |
| `chat` | object[] | Chat history. Valid objects are the [`system`, `user` and `assistant` messages as defined by OpenAI](https://platform.openai.com/docs/api-reference/chat/create#chat-create-messages) | none |
| `input` | string | Base64-encoded audio data in a [format supported by OpenAI's transcription service](https://platform.openai.com/docs/api-reference/audio/createTranscription#audio-createtranscription-file). | none |
| `inputFormat` | string | Format of the audio data. | `'webm'` |
| `speakerName` | string | Name of the speaker. | `'user'` |
| `sttModel` | string | Name of the speech-to-text model. | `'whisper-1'` |
| `chatModel` | string | Name of the chat model. | `'gpt-3.5-turbo'` |
| `ttsModel` | string | Name of the text-to-speech model. | `'tts-1'` |
| `voice` | string | Name of the voice to use for text-to-speech. | `'nova'` |
| `outputFormat` | string | Format of the audio data returned by the API; one of `'opus'`, `'mp3'`, `'aac'`, `'flac'`. | `'opus'` |


### Example

With the server running, run `npm run client-example` to compile and run the example in `examples/client/index.ts`. This will generate a `part0.mp3` file in the `examples/client` directory.


## Parsing the response on the client

Recovering the data takes some effort. The following is the gist of how this can be done.

The response is sent in chunks. Below, a chunk corresponds to a paragraph (defined as sections separated by a blank line), where for each paragraph the query, text response and audio response are sent over the network in that order, each prefixed by their length as a 32-bit integer in LE format.

Playing the resulting audio object urls in sequence will play the audio response. This, as well as recording the query, is left as an exercise.

```ts
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
						const file = new File(
							[new Uint8Array(chunkPart)],
							`response.${body.outputFormat}`,
							{ type: `audio/${body.outputFormat}` },
						);
						const url = URL.createObjectURL(file);
						responseAudioFileUrls.push(url);
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
```

where `processChunkPart` is defined as

```ts
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
```

and `combineFragments` is defined as

```ts
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
```
