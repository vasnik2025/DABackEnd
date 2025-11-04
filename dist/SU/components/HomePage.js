"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_router_dom_1 = require("react-router-dom");
const CameraIcon_1 = require("./icons/CameraIcon");
const UserCircleIcon_1 = require("./icons/UserCircleIcon");
const SparklesIcon_1 = require("./icons/SparklesIcon");
const HomePage = () => {
    return (<div className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      {/* Hero Section - Background inherited */}
      <section>
        <div className="container mx-auto px-6 py-20 sm:py-24 lg:py-32 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 text-accent-700 dark:text-accent-800">
            Connect, Share &amp; Cherish with SwingerUnion.com
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl mb-10 max-w-2xl mx-auto text-gray-700 dark:text-gray-300">
            Your private and modern space to manage your personal photo collection and express yourself.
          </p>
          <div className="space-y-4 sm:space-y-0 sm:space-x-4">
            <react_router_dom_1.Link to="/register" className="inline-block bg-gray-800 text-white hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 font-semibold px-8 py-3 rounded-lg shadow-md transition duration-300 text-lg">
              Get Started
            </react_router_dom_1.Link>
            <react_router_dom_1.Link to="/login" className="inline-block bg-transparent border-2 border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white dark:border-gray-300 dark:text-gray-300 dark:hover:bg-gray-300 dark:hover:text-gray-900 font-semibold px-8 py-3 rounded-lg transition duration-300 text-lg">
              Member Login
            </react_router_dom_1.Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 sm:mb-16 text-accent-700 dark:text-accent-800">
            Why Choose SwingerUnion.com?
          </h2>
          <div className="grid md:grid-cols-3 gap-8 sm:gap-12">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg text-center transform transition-all hover:scale-105 duration-300">
              <div className="flex justify-center mb-6">
                <CameraIcon_1.CameraIcon className="h-16 w-16 text-accent-500 dark:text-accent-400"/>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-accent-600 dark:text-accent-700">Organize Your Memories</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Easily upload, view, and manage your photo collection in a secure, personal space.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg text-center transform transition-all hover:scale-105 duration-300">
              <div className="flex justify-center mb-6">
                <UserCircleIcon_1.UserCircleIcon className="h-16 w-16 text-accent-500 dark:text-accent-400"/>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-accent-600 dark:text-accent-700">Personalize Your Profile</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Customize your profile and let our AI help you craft the perfect bio to express yourself.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg text-center transform transition-all hover:scale-105 duration-300">
              <div className="flex justify-center mb-6">
                <SparklesIcon_1.SparklesIcon className="h-16 w-16 text-accent-500 dark:text-accent-400"/>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-accent-600 dark:text-accent-700">Modern & Seamless Experience</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Enjoy a beautifully designed, responsive, and intuitive interface on any device.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section - Background inherited */}
      <section className="py-16 sm:py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white dark:bg-gray-700 p-8 sm:p-12 rounded-xl shadow-xl">
            <p className="text-xl sm:text-2xl italic text-gray-700 dark:text-gray-300 mb-6">
              "SwingerUnion.com has made managing my personal photos so much easier and more enjoyable. The interface is beautiful!"
            </p>
            <p className="font-semibold text-gray-600 dark:text-gray-400">- A Happy Member (Simulated)</p>
          </div>
        </div>
      </section>

      {/* Final Call to Action Section */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-accent-700 dark:text-accent-800">
            Ready to Join the Union?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-10 max-w-xl mx-auto">
            Become a part of SwingerUnion.com today and start organizing your cherished moments in style.
          </p>
          <react_router_dom_1.Link to="/register" className="bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-600 dark:hover:bg-gray-500 font-semibold px-10 py-4 rounded-lg shadow-md transition duration-300 text-lg">
            Sign Up Now
          </react_router_dom_1.Link>
        </div>
      </section>
    </div>);
};
exports.default = HomePage;
