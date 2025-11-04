// Extend Express types (optional, for TS convenience)
import 'express-serve-static-core';
declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string };
  }
}