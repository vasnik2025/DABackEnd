"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = void 0;
// src/utils/generateId.ts
// For demo purposes, if you need server-generated IDs that aren't database auto-incremented.
// In a real application, prefer database-generated IDs (like auto-increment integers or UUIDs/NEWID()).
const generateId = (prefix = 'item_') => {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 11);
    return `${prefix}${timestamp}_${randomPart}`;
};
exports.generateId = generateId;
