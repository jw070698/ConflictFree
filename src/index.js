import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Input from './Input';
import Chat from './Chat';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route } from 'react-router-dom';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Input />} />
      <Route path="/Chat" element={<Chat />} />
    </Routes>
  </BrowserRouter>
);

reportWebVitals();
