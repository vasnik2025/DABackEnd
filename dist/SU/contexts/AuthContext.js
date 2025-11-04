
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthProvider = exports.AuthContext = void 0;
const react_1 = __importStar(require("react"));
const apiService_ts_1 = require("../services/apiService.ts");
const SESSION_STORAGE_KEY = 'currentUserSessionId';
exports.AuthContext = (0, react_1.createContext)(undefined);
const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const loadUserFromSession = (0, react_1.useCallback)(async () => {
        setIsLoading(true);
        const userId = localStorage.getItem(SESSION_STORAGE_KEY);
        if (userId) {
            try {
                const user = await (0, apiService_ts_1.apiGetUserById)(userId);
                if (user) {
                    setCurrentUser(user);
                }
                else {
                    localStorage.removeItem(SESSION_STORAGE_KEY);
                }
            }
            catch (error) {
                console.error("Failed to load user from session:", error);
                localStorage.removeItem(SESSION_STORAGE_KEY);
            }
        }
        setIsLoading(false);
    }, []);
    (0, react_1.useEffect)(() => {
        loadUserFromSession();
    }, [loadUserFromSession]);
    const performUserUpdate = async (updates) => {
        if (!currentUser) {
            console.error("No current user to update.");
            throw new Error("User not authenticated for update.");
        }
        setIsLoading(true);
        try {
            const updatedUser = await (0, apiService_ts_1.apiUpdateUser)(currentUser.id, updates);
            if (updatedUser) {
                setCurrentUser(updatedUser);
                return updatedUser;
            }
            throw new Error("Failed to update user: No user data returned from API.");
        }
        catch (error) {
            console.error("User update failed in AuthContext:", error);
            await loadUserFromSession();
            throw error;
        }
        finally {
            setIsLoading(false);
        }
    };
    const login = (0, react_1.useCallback)(async (credentials) => {
        setIsLoading(true);
        try {
            const user = await (0, apiService_ts_1.apiLoginUser)(credentials);
            if (user) {
                setCurrentUser(user);
                localStorage.setItem(SESSION_STORAGE_KEY, user.id);
                return user;
            }
            setCurrentUser(null);
            localStorage.removeItem(SESSION_STORAGE_KEY);
            throw new Error("Invalid credentials or user not found.");
        }
        catch (error) {
            console.error("Login failed:", error);
            setCurrentUser(null);
            localStorage.removeItem(SESSION_STORAGE_KEY);
            throw error;
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    const register = (0, react_1.useCallback)(async (registrationData) => {
        setIsLoading(true);
        try {
            if (!registrationData.username || !registrationData.email || !registrationData.password || !registrationData.country || !registrationData.city) {
                throw new Error("Username, email, password, country, and city are required for registration.");
            }
            const response = await (0, apiService_ts_1.apiRegisterUser)(registrationData);
            return response;
        }
        catch (error) {
            console.error("Registration process failed in AuthContext:", error);
            throw error;
        }
        finally {
            setIsLoading(false);
        }
    }, [login]);
    const logout = (0, react_1.useCallback)(() => {
        if (currentUser) {
            (0, apiService_ts_1.apiUpdateUser)(currentUser.id, { isOnline: false });
        }
        setCurrentUser(null);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setIsLoading(false);
    }, [currentUser]);
    const updateUserProfilePicture = (0, react_1.useCallback)(async (dataUrl) => {
        return performUserUpdate({ profilePictureUrl: dataUrl });
    }, [performUserUpdate]);
    return (<exports.AuthContext.Provider value={{
            currentUser,
            isAuthenticated: !!currentUser,
            isLoading,
            login,
            register,
            logout,
            updateUser: performUserUpdate,
            updateUserProfilePicture,
            reloadUser: loadUserFromSession
        }}>
      {children}
    </exports.AuthContext.Provider>);
};
exports.AuthProvider = AuthProvider;
