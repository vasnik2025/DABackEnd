interface NotificationPayload {
  type: 'chat_invite_received' | 'chat_invite_accepted' | 'chat_invite_declined';
  message: string;
  payload: any;
}

// Temporary stub function. Replace this with real-time push (WebSocket, SignalR, etc.)
export const sendNotification = async (userId: string, notification: NotificationPayload) => {
  console.log(`🔔 Sending notification to user ${userId}:`, notification);
  // You can later integrate Azure SignalR or WebSocket here
};
