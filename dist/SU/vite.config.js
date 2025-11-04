
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const vite_1 = require("vite");
const url_1 = require("url");
const path_2 = require("path");
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = (0, path_2.dirname)(__filename);
exports.default = (0, vite_1.defineConfig)(({ mode }) => {
    // Load all env vars, not just VITE_ prefixed, by using '' as the third arg.
    // Load from project root (BackEnd/src/SU/) up one level to BackEnd/src/ then up one to BackEnd/ then up one to project root.
    const env = (0, vite_1.loadEnv)(mode, path_1.default.resolve(__dirname, '../../../'), '');
    return {
        define: {
            // For import.meta.env.VITE_API_BASE_URL
            'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || ''),
        },
        resolve: {
            alias: {
                '@': path_1.default.resolve(__dirname, '.'),
            }
        },
        build: {
            outDir: 'dist',
        }
    };
});
