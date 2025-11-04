"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const Modal = ({ isOpen, onClose, title, children, isFadingOut }) => {
    // The Modal component will be mounted/unmounted by its parent based on `isOpen`.
    // While it's mounted (isOpen=true), `isFadingOut` controls the exit animation.
    if (!isOpen) {
        return null; // If parent says it's not open, don't render.
    }
    // Determine animation classes
    // Fade in: when isOpen is true AND isFadingOut is false (or undefined)
    // Fade out: when isOpen is true AND isFadingOut is true
    const backdropOpacityClass = isOpen && !isFadingOut
        ? "opacity-100"
        : "opacity-0";
    const contentTransformClasses = isOpen && !isFadingOut
        ? "opacity-100 scale-100"
        : "opacity-0 scale-95";
    return (<div className={`fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out ${backdropOpacityClass}`} onClick={onClose} aria-modal="true" role="dialog">
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto transform transition-all duration-300 ease-in-out ${contentTransformClasses}`} onClick={(e) => e.stopPropagation()}>
        {title && (<div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" aria-label="Close modal">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>)}
        <div>{children}</div>
      </div>
      {/* Removed the <style> tag with keyframe animation */}
    </div>);
};
exports.default = Modal;
