
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_router_dom_1 = require("react-router-dom");
const useAuth_ts_1 = require("../hooks/useAuth.ts");
const CameraIcon_1 = require("./icons/CameraIcon");
const countries_1 = require("../data/countries"); // Import the country list
const Modal_1 = __importDefault(require("./Modal"));
const RegistrationPage = () => {
    const [username, setUsername] = (0, react_1.useState)('');
    const [email, setEmail] = (0, react_1.useState)('');
    const [password, setPassword] = (0, react_1.useState)('');
    const [confirmPassword, setConfirmPassword] = (0, react_1.useState)('');
    const [country, setCountry] = (0, react_1.useState)('');
    const [city, setCity] = (0, react_1.useState)('');
    const [isSubmitting, setIsSubmitting] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    const [modalContent, setModalContent] = (0, react_1.useState)(null);
    const auth = (0, useAuth_ts_1.useAuth)();
    const navigate = (0, react_router_dom_1.useNavigate)();
    if (auth.isLoading) {
        return (react_1.default.createElement("div", { className: "min-h-screen flex items-center justify-center" },
            react_1.default.createElement("p", { className: "text-xl text-gray-700 dark:text-gray-300" }, "Loading...")));
    }
    if (auth.isAuthenticated) {
        return react_1.default.createElement(react_router_dom_1.Navigate, { to: "/profile", replace: true });
    }
    const validateEmail = (emailToValidate) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToValidate);
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setModalContent(null);
        if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim() || !country.trim() || !city.trim()) {
            setError('All fields marked with * are required.');
            return;
        }
        if (!validateEmail(email)) {
            setError('Please enter a valid email address.');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setIsSubmitting(true);
        try {
            const registrationData = {
                username: username.trim(),
                email: email.trim().toLowerCase(),
                password: password,
                country: country.trim(),
                city: city.trim(),
            };
            const response = await auth.register(registrationData);
            setModalContent({
                title: "Registration Successful!",
                message: response.message,
                isError: false
            });
        }
        catch (err) {
            setError(err.message || 'Registration failed. An unknown error occurred.');
        }
        finally {
            setIsSubmitting(false);
        }
    };
    const closeModalAndRedirect = () => {
        setModalContent(null);
        if (modalContent && !modalContent.isError) {
            navigate('/login');
        }
    };
    const RequiredAsterisk = ({ className }) => react_1.default.createElement("span", { className: `text-red-500 ml-1 ${className}` }, "*");
    return (react_1.default.createElement(react_1.default.Fragment, null,
        react_1.default.createElement("div", { className: "min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8" },
            react_1.default.createElement("div", { className: "max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-10 rounded-xl shadow-2xl" },
                react_1.default.createElement("div", null,
                    react_1.default.createElement("div", { className: "mx-auto flex items-center justify-center h-16 w-16 text-accent-500 dark:text-accent-400" },
                        react_1.default.createElement(CameraIcon_1.CameraIcon, { className: "h-12 w-12" })),
                    react_1.default.createElement("h2", { className: "mt-6 text-center text-3xl font-extrabold text-accent-700 dark:text-accent-800" }, "Create your account"),
                    react_1.default.createElement("p", { className: "mt-2 text-center text-md text-gray-600 dark:text-gray-400" }, "Join now to connect with our community.")),
                react_1.default.createElement("form", { className: "mt-8 space-y-6", onSubmit: handleSubmit, noValidate: true },
                    error && react_1.default.createElement("p", { className: "text-red-500 dark:text-red-400 text-sm text-center mb-4" }, error),
                    react_1.default.createElement("div", { className: "rounded-md shadow-sm space-y-4" },
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { htmlFor: "reg-username", className: "block text-sm font-medium text-gray-700 dark:text-gray-300" },
                                "Username",
                                react_1.default.createElement(RequiredAsterisk, null)),
                            react_1.default.createElement("input", { id: "reg-username", name: "username", type: "text", autoComplete: "username", required: true, className: "appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-md focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm", placeholder: "Choose a username", value: username, onChange: (e) => setUsername(e.target.value), "aria-describedby": error && error.toLowerCase().includes("username") ? "username-error" : undefined, disabled: isSubmitting })),
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { htmlFor: "reg-email", className: "block text-sm font-medium text-gray-700 dark:text-gray-300" },
                                "Email address",
                                react_1.default.createElement(RequiredAsterisk, null)),
                            react_1.default.createElement("input", { id: "reg-email", name: "email", type: "email", autoComplete: "email", required: true, className: "appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-md focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm", placeholder: "your@email.com", value: email, onChange: (e) => setEmail(e.target.value), "aria-describedby": error && error.toLowerCase().includes("email") ? "email-error" : undefined, disabled: isSubmitting })),
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { htmlFor: "reg-country", className: "block text-sm font-medium text-gray-700 dark:text-gray-300" },
                                "Country",
                                react_1.default.createElement(RequiredAsterisk, null)),
                            react_1.default.createElement("select", { id: "reg-country", name: "country", autoComplete: "country-name", required: true, className: "appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-md focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm", value: country, onChange: (e) => setCountry(e.target.value), disabled: isSubmitting },
                                react_1.default.createElement("option", { value: "", disabled: true }, "Select your country"),
                                countries_1.countries.map((c) => (react_1.default.createElement("option", { key: c.code, value: c.name }, c.name))))),
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { htmlFor: "reg-city", className: "block text-sm font-medium text-gray-700 dark:text-gray-300" },
                                "City",
                                react_1.default.createElement(RequiredAsterisk, null)),
                            react_1.default.createElement("input", { id: "reg-city", name: "city", type: "text", autoComplete: "address-level2", required: true, className: "appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-md focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm", placeholder: "Your city", value: city, onChange: (e) => setCity(e.target.value), disabled: isSubmitting })),
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { htmlFor: "reg-password", className: "block text-sm font-medium text-gray-700 dark:text-gray-300" },
                                "Password",
                                react_1.default.createElement(RequiredAsterisk, null)),
                            react_1.default.createElement("input", { id: "reg-password", name: "password", type: "password", autoComplete: "new-password", required: true, className: "appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-md focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm", placeholder: "Password (min. 6 characters)", value: password, onChange: (e) => setPassword(e.target.value), "aria-describedby": error && (error.toLowerCase().includes("password") || error.toLowerCase().includes("match")) ? "password-error" : undefined, disabled: isSubmitting })),
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { htmlFor: "reg-confirm-password", className: "block text-sm font-medium text-gray-700 dark:text-gray-300" },
                                "Confirm Password",
                                react_1.default.createElement(RequiredAsterisk, null)),
                            react_1.default.createElement("input", { id: "reg-confirm-password", name: "confirmPassword", type: "password", autoComplete: "new-password", required: true, className: "appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-b-md focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm", placeholder: "Confirm Password", value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), "aria-describedby": error && error.toLowerCase().includes("match") ? "confirm-password-error" : undefined, disabled: isSubmitting }))),
                    react_1.default.createElement("div", { className: "mt-6" },
                        react_1.default.createElement("button", { type: "submit", disabled: isSubmitting, className: "group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 dark:focus:ring-offset-gray-900 disabled:opacity-50" }, isSubmitting ? 'Signing up...' : 'Sign up')),
                react_1.default.createElement("p", { className: "mt-6 text-center text-sm text-gray-600 dark:text-gray-400" },
                    "Already have an account?",
                    ' ',
                    react_1.default.createElement(react_router_dom_1.Link, { to: "/login", className: "font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300" }, "Sign in")))),
        modalContent && (react_1.default.createElement(Modal_1.default, { isOpen: !!modalContent, onClose: closeModalAndRedirect, title: modalContent.title },
            react_1.default.createElement("div", { className: "text-center" },
                react_1.default.createElement("p", { className: modalContent.isError ? 'text-red-500' : 'text-gray-700 dark:text-gray-200' }, modalContent.message),
                react_1.default.createElement("div", { className: "mt-6 flex justify-center" },
                    react_1.default.createElement("button", { onClick: closeModalAndRedirect, className: "px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-md shadow-sm" }, "OK")))))));
};
exports.default = RegistrationPage;
