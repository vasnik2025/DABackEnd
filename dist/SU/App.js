
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_router_dom_1 = require("react-router-dom");
const Navbar_1 = __importDefault(require("@/components/Navbar"));
const LoginPage_1 = __importDefault(require("./LoginPage"));
const ProfilePage_1 = require("./ProfilePage");
const RegistrationPage_1 = __importDefault(require("./RegistrationPage"));
const HomePage_1 = __importDefault(require("@/components/HomePage"));
const ChatPage_1 = __importDefault(require("@/components/ChatPage"));
const EmailVerificationPage_1 = __importDefault(require("@/components/EmailVerificationPage"));
const SimpleErrorBoundary_1 = __importDefault(require("@/components/SimpleErrorBoundary"));
const useAuth_1 = require("@/hooks/useAuth");
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, isLoading } = (0, useAuth_1.useAuth)();
    if (isLoading) {
        return react_1.default.createElement("div", { className: "flex justify-center items-center h-screen" },
            react_1.default.createElement("p", { className: "text-xl" }, "Loading session..."));
    }
    if (!isAuthenticated) {
        return react_1.default.createElement(react_router_dom_1.Navigate, { to: "/login", replace: true });
    }
    return react_1.default.createElement(react_1.default.Fragment, null, children);
};
const PublicRoute = ({ children }) => {
    const { isAuthenticated, isLoading } = (0, useAuth_1.useAuth)();
    if (isLoading) {
        return react_1.default.createElement("div", { className: "flex justify-center items-center h-screen" },
            react_1.default.createElement("p", { className: "text-xl" }, "Loading session..."));
    }
    if (isAuthenticated) {
        return react_1.default.createElement(react_router_dom_1.Navigate, { to: "/profile", replace: true });
    }
    return react_1.default.createElement(react_1.default.Fragment, null, children);
};
const App = () => {
    return (react_1.default.createElement(react_router_dom_1.HashRouter, null,
        react_1.default.createElement("div", { className: "flex flex-col min-h-screen" },
            react_1.default.createElement(Navbar_1.default, null),
            react_1.default.createElement("main", { className: "flex-grow" },
                react_1.default.createElement(SimpleErrorBoundary_1.default, null,
                    react_1.default.createElement(react_router_dom_1.Routes, null,
                        react_1.default.createElement(react_router_dom_1.Route, { path: "/", element: react_1.default.createElement(HomePage_1.default, null) }),
                        react_1.default.createElement(react_router_dom_1.Route, { path: "/login", element: react_1.default.createElement(PublicRoute, null,
                                react_1.default.createElement(LoginPage_1.default, null)) }),
                        react_1.default.createElement(react_router_dom_1.Route, { path: "/register", element: react_1.default.createElement(PublicRoute, null,
                                react_1.default.createElement(RegistrationPage_1.default, null)) }),
                        react_1.default.createElement(react_router_dom_1.Route, { path: "/profile", element: react_1.default.createElement(ProtectedRoute, null,
                                react_1.default.createElement(ProfilePage_1.ProfilePage, null)) }),
                        react_1.default.createElement(react_router_dom_1.Route, { path: "/chat", element: react_1.default.createElement(ProtectedRoute, null,
                                react_1.default.createElement(ChatPage_1.default, null)) }),
                        react_1.default.createElement(react_router_dom_1.Route, { path: "/verify-email-link", element: react_1.default.createElement(EmailVerificationPage_1.default, null) }),
                        react_1.default.createElement(react_router_dom_1.Route, { path: "*", element: react_1.default.createElement(react_router_dom_1.Navigate, { to: "/", replace: true }) })))),
            react_1.default.createElement("footer", { className: "bg-gray-200 dark:bg-gray-800 text-center p-4 text-sm text-gray-600 dark:text-gray-400" },
                "© ",
                new Date().getFullYear(),
                " SwingerUnion.com. All rights reserved (simulated)."))));
};
exports.default = App;
