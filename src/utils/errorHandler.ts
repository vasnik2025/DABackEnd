// FIX: Changed type-only import to standard import to fix type resolution.
import type { Request, Response, NextFunction } from 'express';

// Define a more specific type for application errors
export interface AppError extends Error {
  statusCode?: number;
  status?: string; // e.g., 'fail', 'error'
  isOperational?: boolean; // To distinguish operational errors from programming errors
  unverifiedUser?: any;
  code?: string;
  details?: any;
}

// Custom error class for operational errors
export class OperationalError extends Error implements AppError {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // All instances of this class are operational errors

    Object.setPrototypeOf(this, OperationalError.prototype); // Maintain prototype chain

    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

// Global error handling middleware
export const globalErrorHandler = (
  err: AppError,
  req: Request,
  res: Response, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  const appError = err as AppError;
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
    const responsePayload: { status: string; message: string; [key: string]: any } = {
        status: appError.status,
        message: appError.message,
    };
    if (appError.code) responsePayload.code = appError.code;
    if (appError.details) responsePayload.details = appError.details;
    if (appError.unverifiedUser) responsePayload.unverifiedUser = appError.unverifiedUser;

    return res.status(appError.statusCode).json(responsePayload);
  }

  // Programming or other unknown error: don't leak error details
  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong! Please try again later.',
  });
};