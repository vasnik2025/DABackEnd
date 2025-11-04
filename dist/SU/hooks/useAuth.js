"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuth = void 0;
const react_1 = require("react");
const AuthContext_1 = require("../contexts/AuthContext");
const useAuth = () => {
    const context = (0, react_1.useContext)(AuthContext_1.AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
exports.useAuth = useAuth;
