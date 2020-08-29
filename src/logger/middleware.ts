import { Logger } from 'winston';
import { NextFunction, Request, Response, RequestHandler, ErrorRequestHandler } from 'express';

export type LoggerMiddleware = (logger: Logger) => RequestHandler | ErrorRequestHandler;

export const log_request: LoggerMiddleware = (logger: Logger) => (req: Request, res: Response, next: NextFunction) => {
	const { url, params, query, headers, method, body } = req;
	logger.log('http', 'income request', { request: { url, params, query, headers, method, body } });
	next()
};

export const log_response: LoggerMiddleware = (logger: Logger) => (req: Request, res: Response, next: NextFunction) => {
	const [oldWrite, oldEnd] = [res.write, res.end];
	const chunks: Buffer[] = [];

	(res.write as unknown) = function (chunk: ArrayBuffer | SharedArrayBuffer) {
		chunks.push(Buffer.from(chunk));
		(oldWrite as Function).apply(res, arguments);
	};

	(res.end as unknown) = function (chunk: ArrayBuffer | SharedArrayBuffer) {
		if (chunk) {
			chunks.push(Buffer.from(chunk));
		}
		const body = Buffer.concat(chunks).toString('utf8');
		const { statusCode, statusMessage } = res;
		logger.log('http', 'outcome response', { response: { statusCode, statusMessage, body } });
		(oldEnd as Function).apply(res, arguments);
	};

	next();
}

export const log_error: LoggerMiddleware = (logger: Logger) => (err: any, req: Request, res: Response, next: NextFunction) => {
	let { message, name, stack } = err;
	message = message ? `${name}: ${message}` : 'an error occured';
	const meta = { stack } || { error: err };
	logger.log('error', message, meta);
	next(err);
}