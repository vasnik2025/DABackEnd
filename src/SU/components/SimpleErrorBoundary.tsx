// FIX: Corrected React import and component extension to resolve typing errors.
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// FIX: Extended React.Component to correctly define a class component.
class SimpleErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined,
    errorInfo: undefined,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in SimpleErrorBoundary:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const errorDetails = this.state.error && (
        <details className="mt-2 text-left bg-red-50 p-3 rounded overflow-auto max-h-60 border border-red-300">
          <summary className="font-semibold cursor-pointer text-red-600">Error Details (for developers)</summary>
          <pre className="mt-2 text-xs text-red-700 whitespace-pre-wrap">
            {this.state.error.toString()}
            {this.state.errorInfo && <br />}
            {typeof this.state.errorInfo?.componentStack === 'string'
              ? this.state.errorInfo.componentStack
              : 'Component stack not available.'}
          </pre>
        </details>
      );
      return (
        <div className="p-4 m-4 text-center bg-red-100 border border-red-400 text-red-700 rounded-lg shadow">
          <h1 className="text-2xl font-bold mb-3 text-red-800">Oops! Something went wrong.</h1>
          <p className="mb-2 text-red-700">We're sorry, an unexpected error occurred while trying to display this page.</p>
          {errorDetails}
           <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Please try reloading the page or returning to the home page. If the problem persists, please check the browser console for more specific error messages.
          </p>
          <div className="mt-6">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 mr-2"
            >
              Reload Page
            </button>
            <button
              onClick={() => window.location.hash = '#/'}
              className="px-5 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SimpleErrorBoundary;