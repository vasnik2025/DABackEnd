"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOCK_USERS = void 0;
const calculateExpiry = (daysFromNow) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString();
};
exports.MOCK_USERS = [
    {
        id: 'user_alice',
        username: 'AliceWonder',
        email: 'alicewonder@example.com',
        membershipType: 'trial',
        membershipExpiryDate: calculateExpiry(10), // Active trial
        profilePictureUrl: undefined,
    },
    {
        id: 'user_bob',
        username: 'BobTheBuilder',
        email: 'bobthebuilder@example.com',
        membershipType: 'trial',
        membershipExpiryDate: calculateExpiry(-5), // Expired trial
        profilePictureUrl: undefined,
    },
    {
        id: 'user_charlie',
        username: 'CharlieBrown',
        email: 'charliebrown@example.com',
        membershipType: 'trial',
        membershipExpiryDate: calculateExpiry(14), // Active trial
        profilePictureUrl: undefined,
    },
    {
        id: 'user_diana',
        username: 'DianaPrince',
        email: 'dianaprince@example.com',
        membershipType: 'unlimited', // Example of an already unlimited user
        subscribedAt: new Date(new Date().setMonth(new Date().getMonth() - 2)).toISOString(), // Subscribed 2 months ago
        membershipExpiryDate: undefined,
        profilePictureUrl: undefined,
    },
    {
        id: 'user_edward',
        username: 'EdwardScissorhands',
        email: 'edwardscissorhands@example.com',
        membershipType: 'trial',
        membershipExpiryDate: calculateExpiry(-20), // Expired trial
        profilePictureUrl: undefined,
    },
    {
        id: 'user_fiona',
        username: 'FionaGallagher',
        email: 'fionagallagher@example.com',
        membershipType: 'trial',
        membershipExpiryDate: calculateExpiry(5), // Active trial
        profilePictureUrl: undefined,
    },
    {
        id: 'user_george',
        username: 'GeorgeCostanza',
        email: 'georgecostanza@example.com',
        membershipType: 'none', // Example of a user with no active/trial membership
        membershipExpiryDate: undefined,
        profilePictureUrl: undefined,
    }
];
