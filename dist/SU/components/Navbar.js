
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_router_dom_1 = require("react-router-dom");
const useAuth_1 = require("../hooks/useAuth");
const SULogo_jpg_1 = __importDefault(require("/assets/img/SULogo.jpg"));
const Navbar = () => {
    const { isAuthenticated, logout, currentUser } = (0, useAuth_1.useAuth)();
    const navigate = (0, react_router_dom_1.useNavigate)();
    const handleLogout = () => {
        logout();
        navigate('/login');
    };
    const linkClass = "bg-accent-500 hover:bg-accent-600 text-white px-3 py-2 rounded-md text-sm font-medium shadow";
    return (react_1.default.createElement("nav", { className: "bg-gray-200 dark:bg-gray-800 shadow-md" },
        react_1.default.createElement("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" },
            react_1.default.createElement("div", { className: "flex items-center justify-between h-16" },
                react_1.default.createElement("div", { className: "flex items-center" },
                    react_1.default.createElement(react_router_dom_1.Link, { to: "/", className: "flex-shrink-0 flex items-center text-accent-700 dark:text-accent-300" },
                        react_1.default.createElement("img", { src: SULogo_jpg_1.default, alt: "SwingerUnion Logo", className: "h-10 w-10 mr-2 rounded-full object-cover" }),
                        react_1.default.createElement("span", { className: "font-bold text-xl hidden sm:block" }, "SwingerUnion.com"))),
                react_1.default.createElement("div", { className: "flex items-center space-x-4" }, isAuthenticated ? (react_1.default.createElement(react_1.default.Fragment, null,
                    react_1.default.createElement("span", { className: "text-gray-800 dark:text-gray-300 hidden sm:inline" },
                        "Hi, ", currentUser === null || currentUser === void 0 ? void 0 :
                        currentUser.username,
                        "!"),
                    react_1.default.createElement(react_router_dom_1.Link, { to: "/profile", className: linkClass }, "Profile"),
                    react_1.default.createElement("button", { onClick: handleLogout, className: linkClass }, "Logout"))) : (react_1.default.createElement(react_1.default.Fragment, null,
                    react_1.default.createElement(react_router_dom_1.Link, { to: "/login", className: "text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium" }, "Login"),
                    react_1.default.createElement(react_router_dom_1.Link, { to: "/register", className: "bg-accent-500 hover:bg-accent-600 text-white px-3 py-2 rounded-md text-sm font-medium shadow" }, "Sign up"))))))));
};
exports.default = Navbar;
