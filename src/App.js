import './App.css';
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Analysis from './Analysis';
import Recommendation from './Recommendation';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/recommendation" element={<Recommendation />} />
      </Routes>
    </Router>
  );
}

export default App;
