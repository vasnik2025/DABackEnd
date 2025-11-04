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
const react_1 = __importStar(require("react"));
const react_router_dom_1 = require("react-router-dom");
const useAuth_ts_1 = require("../hooks/useAuth.ts");
// User type no longer needed directly for login, UserCredentials used by AuthContext
const CameraIcon_1 = require("./icons/CameraIcon");
const MailIcon_1 = require("./icons/MailIcon");
const LockClosedIcon_1 = require("./icons/LockClosedIcon");
const LoginPage = () => {
    const [usernameOrEmail, setUsernameOrEmail] = (0, react_1.useState)('');
    const [password, setPassword] = (0, react_1.useState)('');
    const [rememberMe, setRememberMe] = (0, react_1.useState)(false); // Remember me is UI only for now
    const [error, setError] = (0, react_1.useState)('');
    const [isSubmitting, setIsSubmitting] = (0, react_1.useState)(false);
    const auth = (0, useAuth_ts_1.useAuth)();
    const navigate = (0, react_router_dom_1.useNavigate)();
    if (auth.isLoading) {
        return (<div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-gray-700 dark:text-gray-300">Loading...</p>
      </div>);
    }
    if (auth.isAuthenticated) {
        return <react_router_dom_1.Navigate to="/profile" replace/>;
    }
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!usernameOrEmail.trim() || !password.trim()) {
            setError('Please enter both username/email and password.');
            return;
        }
        setError('');
        setIsSubmitting(true);
        try {
            // Determine if input is email or username
            const credentials = usernameOrEmail.includes('@')
                ? { email: usernameOrEmail, password }
                : { username: usernameOrEmail, password };
            const user = await auth.login(credentials);
            if (user) {
                navigate('/profile');
            }
            else {
                // This case should be handled by auth.login throwing an error
                setError('Login failed. Please check your credentials.');
            }
        }
        catch (err) {
            setError(err.message || 'Login failed. Please check your credentials.');
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-4xl">
        <div className="bg-white dark:bg-gray-800 shadow-xl rounded-lg overflow-hidden lg:grid lg:grid-cols-2">
          {/* Branding Panel */}
          <div className="hidden lg:flex flex-col justify-center items-center bg-gray-200 dark:bg-gray-700 p-12">
            <CameraIcon_1.CameraIcon className="h-24 w-24 mb-6 text-accent-600 dark:text-accent-500"/>
            <h1 className="text-4xl font-bold mb-3 text-accent-700 dark:text-accent-800">SwingerUnion.com</h1>
            <p className="text-lg text-center text-gray-600 dark:text-gray-300">
              Your memories, beautifully organized.
            </p>
          </div>

          {/* Form Panel */}
          <div className="p-6 sm:p-10 lg:p-12">
            {/* Mobile Branding (Visible on small screens) */}
            <div className="lg:hidden flex flex-col items-center mb-8">
              <CameraIcon_1.CameraIcon className="h-16 w-16 text-accent-500 dark:text-accent-400 mb-4"/>
              <h2 className="text-2xl font-bold text-center text-accent-700 dark:text-accent-800">
                SwingerUnion.com
              </h2>
            </div>
          
            <h3 className="text-2xl font-semibold text-accent-700 dark:text-accent-800 text-center lg:text-left">
              Sign In
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 text-center lg:text-left">
              Welcome back! Please enter your details.
            </p>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              {error && (<div className="bg-red-50 dark:bg-red-900 p-3 rounded-md">
                  <p className="text-red-600 dark:text-red-300 text-sm text-center">{error}</p>
                </div>)}
              
              <div>
                <label htmlFor="login-username-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Username or Email
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MailIcon_1.MailIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true"/>
                  </div>
                  <input id="login-username-email" name="username-email" type="text" autoComplete="username" required className="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-md placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm" placeholder="you@example.com or username" value={usernameOrEmail} onChange={(e) => setUsernameOrEmail(e.target.value)} disabled={isSubmitting}/>
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LockClosedIcon_1.LockClosedIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true"/>
                  </div>
                  <input id="login-password" name="password" type="password" autoComplete="current-password" required className="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-md placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting}/>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input id="remember-me" name="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 text-accent-600 dark:text-accent-500 border-gray-300 dark:border-gray-600 rounded focus:ring-accent-500" disabled={isSubmitting}/>
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <a href="#" className="font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300">
                    Forgot your password?
                  </a>
                </div>
              </div>

              <div>
                <button type="submit" disabled={isSubmitting} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-900 disabled:opacity-50">
                  {isSubmitting ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>

            <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <react_router_dom_1.Link to="/register" className="font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300">
                Sign up
              </react_router_dom_1.Link>
            </p>
          </div>
        </div>
      </div>
    </div>);
};
exports.default = LoginPage;
