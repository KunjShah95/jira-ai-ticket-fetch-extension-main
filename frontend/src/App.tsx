import React, { useState, useEffect } from 'react';
import { Button } from "./components/ui/button";
import { Docs } from "./components/ui/Docs";
import { ApiDocs } from "./components/ui/ApiDocs";
import { backendService } from "./services/BackendService";
import './App.css';

const EXTENSION_DOWNLOAD_URL = "/ai-dev-assistant/ai-dev-assistant-0.1.0.vsix";

function handleDownload() {
  window.open(EXTENSION_DOWNLOAD_URL, "_blank");
}

function handleOpenVSCode() {
  // Use the BackendService to open in VS Code
  backendService.openInVSCode('openDashboard');
}

// Open a specific workflow in VS Code
// This utility function can be used when integrating workflow-specific navigation
// Example usage: <button onClick={() => openWorkflowInVSCode(workflow.id)}>View in VS Code</button>
export function openWorkflowInVSCode(workflowId: string) {
  backendService.openInVSCode('viewProgress', workflowId);
}

// Start a new workflow in VS Code with a specific Jira ticket ID
// This utility function can be used when integrating ticket-specific actions
// Example usage: <button onClick={() => startWorkflowInVSCode(ticket.id)}>Start Development</button>
export function startWorkflowInVSCode(jiraTicketId: string) {
  backendService.openInVSCode('startWorkflow', jiraTicketId);
}

const features = [
  {
    icon: (
      <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 17v-2a4 4 0 014-4h4m0 0V7m0 4l-4-4m4 4l4-4" /></svg>
    ),
    title: "Jira Integration",
    desc: "Fetch, analyze, and automate code from Jira tickets."
  },
  {
    icon: (
      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 01-8 0m8 0a4 4 0 00-8 0m8 0V5a4 4 0 00-8 0v2m8 0v2a4 4 0 01-8 0V7" /></svg>
    ),
    title: "AI-Powered Code Generation",
    desc: "LLM analyzes requirements and generates production-ready code."
  },
  {
    icon: (
      <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
    title: "Workflow Automation",
    desc: "Automate branch, PR, tests, and Jira updates in one click."
  },
  {
    icon: (
      <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m4 0h-1v-4h-1m-4 0h-1v-4h-1" /></svg>
    ),
    title: "Iterative Feedback",
    desc: "Approve, reject, and regenerate code with user feedback."
  },
  {
    icon: (
      <svg className="w-10 h-10 text-pink-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
    title: "Multi-Framework Support",
    desc: "Works with TypeScript, React, Node.js, Python, and more."
  },
  {
    icon: (
      <svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
    title: "VS Code Native",
    desc: "All features available directly inside VS Code."
  }
];

const splashImages = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80", // Stylish workspace
  "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=900&q=80", // Developer at night
  "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=900&q=80"  // Futuristic code
];

function App() {
  const [imgIdx, setImgIdx] = useState(0);
  const [showDocs, setShowDocs] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false);
  
  // Always use dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);
  
  useEffect(() => {
    const interval = setInterval(() => setImgIdx(i => (i + 1) % splashImages.length), 6000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-start pb-16 transition-colors duration-500 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800">
      {showDocs && <Docs onClose={() => setShowDocs(false)} />}
      {showApiDocs && <ApiDocs onClose={() => setShowApiDocs(false)} />}
      
      {/* Hero Section */}
      <div className="w-full flex flex-col items-center justify-center pt-16 pb-10 px-4">
        <img src="/logo192.png" alt="AI Dev Assistant Logo" className="w-28 h-28 mb-6 drop-shadow-lg" />
        <h1 className="text-5xl font-extrabold text-blue-200 mb-4 text-center tracking-tight">AI Dev Assistant</h1>
        <p className="text-xl text-gray-200 mb-8 text-center max-w-2xl">
          Automate your Jira, GitHub, and code workflows with AI. Generate, review, and approve code right inside VS Code.
        </p>
        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-md justify-center mb-8">
          <Button className="btn-primary w-full sm:w-auto text-lg py-4 px-10 shadow-lg" onClick={handleDownload}>
            Download Extension
          </Button>
          <Button className="btn-secondary w-full sm:w-auto text-lg py-4 px-10 bg-green-600 hover:bg-green-700 shadow-lg" onClick={handleOpenVSCode}>
            Open in VS Code
          </Button>
        </div>
        <div className="relative w-full max-w-2xl mb-4 aspect-video rounded-xl overflow-hidden shadow-xl border border-gray-700">
          <img
            src={splashImages[imgIdx]}
            alt="Splash"
            className="object-cover w-full h-full transition-opacity duration-1000"
            style={{ opacity: 1 }}
          />
          <span className="absolute bottom-2 right-4 bg-gray-900/70 text-xs px-2 py-1 rounded">Unsplash</span>
        </div>
      </div>
      {/* Features Section */}
      <div className="w-full max-w-5xl px-4 py-10">
        <h2 className="heading-2 text-center mb-10">Key Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <div key={i} className="card flex flex-col items-center text-center">
              <div className="mb-4">{f.icon}</div>
              <h3 className="text-xl font-semibold text-blue-200 mb-2">{f.title}</h3>
              <p className="text-gray-300">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {/* How It Works Section */}
      <div className="w-full max-w-4xl px-4 py-10">
        <h2 className="heading-2 text-center mb-8">How It Works</h2>
        <ol className="relative border-l-4 border-gray-700 pl-8 space-y-8">
          <li className="mb-4">
            <span className="absolute -left-6 top-1 w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-bold">1</span>
            <span className="font-semibold text-white">Start a workflow</span> <span className="text-white">with your Jira ticket key.</span>
          </li>
          <li className="mb-4">
            <span className="absolute -left-6 top-1 w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-bold">2</span>
            <span className="font-semibold text-white">AI analyzes requirements</span> <span className="text-white">and generates code.</span>
          </li>
          <li className="mb-4">
            <span className="absolute -left-6 top-1 w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-bold">3</span>
            <span className="font-semibold text-white">Review, approve, or request changes</span><span className="text-white">—iterate until perfect.</span>
          </li>
          <li className="mb-4">
            <span className="absolute -left-6 top-1 w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-bold">4</span>
            <span className="font-semibold text-white">Automate PR, tests, and Jira updates</span><span className="text-white">—all from VS Code.</span>
          </li>
        </ol>
      </div>
      {/* Docs/Help Section */}
      <div className="text-base text-gray-300 text-center mt-8">
        <span>Need help? </span>
        <button 
          onClick={() => setShowDocs(true)} 
          className="link"
        >
          View Docs
        </button>
        <span> | </span>
        <button 
          onClick={() => setShowApiDocs(true)} 
          className="link"
        >
          API Reference
        </button>
      </div>
    </div>
  );
}

export default App;
