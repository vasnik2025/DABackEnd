"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalErrorHandler = exports.OperationalError = void 0;
// Custom error class for operational errors
class OperationalError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // All instances of this class are operational errors
        Object.setPrototypeOf(this, OperationalError.prototype); // Maintain prototype chain
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = (new Error(message)).stack;
        }
    }
}
exports.OperationalError = OperationalError;
// Global error handling middleware
const globalErrorHandler = (err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
next) => {
    const appError = err;
    appError.statusCode = appError.statusCode || 500;
    appError.status = appError.status || 'error';
    appError.message = appError.message || 'Internal Server Error';
    console.error('ERROR 💥:', {
        message: appError.message,
        statusCode: appError.statusCode,
        status: appError.status,
        stack: appError.stack,
        isOperational: appError.isOperational,
    });
    if (process.env.NODE_ENV === 'development') {
        return res.status(appError.statusCode).json({
            status: appError.status,
            error: appError,
            message: appError.message,
            stack: appError.stack,
        });
    }
    // Operational, trusted error: send message to client
    if (appError.isOperational) {
        const responsePayload = {
            status: appError.status,
            message: appError.message,
        };
        if (appError.code)
            responsePayload.code = appError.code;
        if (appError.details)
            responsePayload.details = appError.details;
        if (appError.unverifiedUser)
            responsePayload.unverifiedUser = appError.unverifiedUser;
        return res.status(appError.statusCode).json(responsePayload);
    }
    // Programming or other unknown error: don't leak error details
    return res.status(500).json({
        status: 'error',
        message: 'Something went very wrong! Please try again later.',
    });
};
exports.globalErrorHandler = globalErrorHandler;
