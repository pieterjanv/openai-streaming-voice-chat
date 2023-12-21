export class Logger {

	log(...args: any[]) {
		console.log(...args);
	}

	debug(...args: any[]) {
		if (process.env.ENV === 'development' && process.env.DEBUG === 'true') {
			console.log(...args);
		}
	}
}
