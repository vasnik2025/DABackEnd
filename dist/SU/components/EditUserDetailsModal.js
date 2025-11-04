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
const Modal_1 = __importDefault(require("./Modal"));
const EditUserDetailsModal = ({ isOpen, onClose, currentUser, onSave, onChangePasswordClick }) => {
    const [formData, setFormData] = (0, react_1.useState)({});
    const [isSaving, setIsSaving] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    (0, react_1.useEffect)(() => {
        if (currentUser && isOpen) {
            setFormData({
                welcomeMessage: currentUser.welcomeMessage || '',
                relationshipStatus: currentUser.relationshipStatus || undefined,
                yearsTogether: currentUser.yearsTogether || undefined,
                age: currentUser.age || undefined,
                gender: currentUser.gender || undefined,
                partner1Age: currentUser.partner1Age || undefined,
                partner2Age: currentUser.partner2Age || undefined,
                city: currentUser.city || '',
                country: currentUser.country || '',
            });
        }
    }, [currentUser, isOpen]);
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError('');
        try {
            const payload = {
                welcomeMessage: formData.welcomeMessage || null,
                relationshipStatus: formData.relationshipStatus || null,
                yearsTogether: formData.yearsTogether ? Number(formData.yearsTogether) : null,
                age: formData.age ? Number(formData.age) : null,
                gender: formData.gender || null,
                partner1Age: formData.partner1Age ? Number(formData.partner1Age) : null,
                partner2Age: formData.partner2Age ? Number(formData.partner2Age) : null,
                city: formData.city || null,
                country: formData.country || null,
            };
            await onSave(payload);
            onClose();
        }
        catch (err) {
            setError(err.message || 'Failed to save profile. Please try again.');
        }
        finally {
            setIsSaving(false);
        }
    };
    const genderOptions = ['Male', 'Female', 'NonBinary', 'Couple', 'Other'];
    const relationshipOptions = ['Marriage', 'Relationship Without Marriage', 'Just Sex Friends'];
    const yearsOptions = Array.from({ length: 31 }, (_, i) => i); // 0 to 30 years
    return (react_1.default.createElement(Modal_1.default, { isOpen: isOpen, onClose: onClose, title: "Edit Profile Details" },
        react_1.default.createElement("div", { className: "bg-rose-50 dark:bg-gray-800/50 p-6 rounded-lg" },
            react_1.default.createElement("form", { onSubmit: handleSubmit, className: "space-y-6" },
                error && react_1.default.createElement("p", { className: "text-red-500 text-sm bg-red-100 dark:bg-red-900 p-3 rounded-md text-center" }, error),
                react_1.default.createElement("div", null,
                    react_1.default.createElement("label", { htmlFor: "welcomeMessage", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Welcome Message"),
                    react_1.default.createElement("textarea", { id: "welcomeMessage", name: "welcomeMessage", value: formData.welcomeMessage || '', onChange: handleChange, rows: 3, className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" })),
                react_1.default.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4" },
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "relationshipStatus", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Relationship"),
                        react_1.default.createElement("select", { id: "relationshipStatus", name: "relationshipStatus", value: formData.relationshipStatus ?? '', onChange: handleChange, className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 h-[42px]" },
                            react_1.default.createElement("option", { value: "" }, "Select Status"),
                            relationshipOptions.map(opt => react_1.default.createElement("option", { key: opt, value: opt }, opt)))),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "yearsTogether", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Years Together"),
                        react_1.default.createElement("select", { id: "yearsTogether", name: "yearsTogether", value: formData.yearsTogether ?? '', onChange: handleChange, className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 h-[42px]" },
                            react_1.default.createElement("option", { value: "" }, "Select Years"),
                            yearsOptions.map(year => react_1.default.createElement("option", { key: year, value: year }, year === 0 ? '< 1 year' : `${year} years`)))),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "partner1Age", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Partner 1 Age"),
                        react_1.default.createElement("input", { type: "number", id: "partner1Age", name: "partner1Age", value: formData.partner1Age ?? '', onChange: handleChange, placeholder: "e.g. 40", className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" })),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "partner2Age", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Partner 2 Age"),
                        react_1.default.createElement("input", { type: "number", id: "partner2Age", name: "partner2Age", value: formData.partner2Age ?? '', onChange: handleChange, placeholder: "e.g. 45", className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" })),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "age", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Age"),
                        react_1.default.createElement("input", { type: "number", id: "age", name: "age", value: formData.age ?? '', onChange: handleChange, placeholder: "e.g. 45", className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" })),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "gender", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Gender"),
                        react_1.default.createElement("select", { id: "gender", name: "gender", value: formData.gender ?? '', onChange: handleChange, className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 h-[42px]" },
                            react_1.default.createElement("option", { value: "" }, "Select Gender"),
                            genderOptions.map(opt => react_1.default.createElement("option", { key: opt, value: opt }, opt))),
                        react_1.default.createElement("p", { className: "text-xs text-rose-400 dark:text-rose-500 mt-1" }, "Must be exactly one of: Male, Female, NonBinary, Couple, Other (matches DB rule).")),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "city", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "City"),
                        react_1.default.createElement("input", { type: "text", id: "city", name: "city", value: formData.city || '', onChange: handleChange, placeholder: "e.g. Athens", className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" })),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { htmlFor: "country", className: "block text-sm font-medium text-rose-700 dark:text-rose-300" }, "Country"),
                        react_1.default.createElement("input", { type: "text", id: "country", name: "country", value: formData.country || '', onChange: handleChange, placeholder: "e.g. Greece", className: "mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" }))),
                react_1.default.createElement("div", { className: "pt-5 flex justify-end items-center space-x-3" },
                    react_1.default.createElement("button", { type: "button", onClick: onClose, disabled: isSaving, className: "px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" }, "Cancel"),
                    react_1.default.createElement("button", { type: "button", onClick: onChangePasswordClick, disabled: isSaving, className: "px-4 py-2 text-sm font-medium rounded-md border border-transparent hover:bg-gray-100 dark:hover:bg-gray-600 text-rose-700 dark:text-rose-200" }, "Change Password"),
                    react_1.default.createElement("button", { type: "submit", disabled: isSaving, className: "px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md shadow-sm disabled:opacity-50" }, isSaving ? 'Saving...' : 'Save Changes'))))));
};
exports.default = EditUserDetailsModal;
