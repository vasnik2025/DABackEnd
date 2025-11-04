"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = void 0;
// Temporary stub function. Replace this with real-time push (WebSocket, SignalR, etc.)
const sendNotification = async (userId, notification) => {
    console.log(`🔔 Sending notification to user ${userId}:`, notification);
    // You can later integrate Azure SignalR or WebSocket here
};
exports.sendNotification = sendNotification;
