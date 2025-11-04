"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const client_1 = __importDefault(require("react-dom/client"));
const App_tsx_1 = __importDefault(require("./App.tsx"));
const AuthContext_tsx_1 = require("./contexts/AuthContext.tsx"); // Corrected path
const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}
const root = client_1.default.createRoot(rootElement);
root.render(<react_1.default.StrictMode>
    <AuthContext_tsx_1.AuthProvider>
      <App_tsx_1.default />
    </AuthContext_tsx_1.AuthProvider>
  </react_1.default.StrictMode>);
