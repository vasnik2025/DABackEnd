
// src/utils/generateId.ts
// For demo purposes, if you need server-generated IDs that aren't database auto-incremented.
// In a real application, prefer database-generated IDs (like auto-increment integers or UUIDs/NEWID()).
export const generateId = (prefix: string = 'item_'): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 11);
  return `${prefix}${timestamp}_${randomPart}`;
};
