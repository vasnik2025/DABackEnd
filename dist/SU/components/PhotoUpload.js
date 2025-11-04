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
const UploadIcon_1 = require("./icons/UploadIcon");
const PhotoUpload = ({ onPhotoUploaded }) => {
    const [uploading, setUploading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const handleFileChange = (0, react_1.useCallback)((event) => {
        const file = event.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setError('Please select an image file (e.g., JPG, PNG, GIF).');
                event.target.value = '';
                return;
            }
            setError(null);
            setUploading(true);
            const reader = new FileReader();
            reader.onloadend = () => {
                // We only pass the necessary data; `id`, `userId`, `uploadedAt` will be set by the API/service
                const photoDataToUpload = {
                    dataUrl: reader.result,
                    caption: `My new photo from ${new Date().toLocaleDateString()}`,
                };
                onPhotoUploaded(photoDataToUpload);
                setUploading(false);
                event.target.value = '';
            };
            reader.onerror = () => {
                setError('Failed to read file.');
                setUploading(false);
                event.target.value = '';
            };
            reader.readAsDataURL(file);
        }
    }, [onPhotoUploaded]);
    return (<div className="mb-8">
      <h3 className="text-xl font-semibold text-accent-600 dark:text-accent-700 mb-4">Upload New Photo</h3>
      <label htmlFor="photo-upload-input" className={`flex flex-col items-center justify-center w-full h-32 px-4 transition bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md appearance-none cursor-pointer hover:border-accent-400 dark:hover:border-accent-500 focus:outline-none ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <UploadIcon_1.UploadIcon className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2"/>
        <span className="flex items-center space-x-2">
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
          </span>
        </span>
        <input id="photo-upload-input" type="file" accept="image/*" className="sr-only" onChange={handleFileChange} disabled={uploading}/>
      </label>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">PNG, JPG, GIF up to 10MB (simulated limit).</p>
    </div>);
};
exports.default = PhotoUpload;
