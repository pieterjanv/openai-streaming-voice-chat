export class Logger {

	log(...args: any[]) {
		console.log(...args);
	}

	debug(...args: any[]) {
		if (process.env.ENV === 'development') {
			console.log(...args);
		}
	}
}
