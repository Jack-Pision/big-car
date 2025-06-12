import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div className="p-8 bg-black/80 rounded-xl text-white">
            <h1 className="text-3xl font-bold mb-4">Welcome to AI Study App</h1>
            <p className="text-lg">Start by using the chat functionality to explore topics.</p>
          </div>} />
          <Route path="search" element={<div className="p-8 bg-black/80 rounded-xl text-white">
            <h1 className="text-3xl font-bold mb-4">Search Functionality</h1>
            <p className="text-lg">The advanced search feature has been simplified and integrated into the main chat interface.</p>
          </div>} />
          <Route path="about" element={<div className="p-8 bg-black/80 rounded-xl text-white">
            <h1 className="text-3xl font-bold mb-4">About AI Study App</h1>
            <p className="text-lg">This application helps you research and understand complex topics with AI assistance.</p>
          </div>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App; 