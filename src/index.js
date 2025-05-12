import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Login from './Login';
import Input from './Input';
import Analysis from './Analysis';
import Recommendation from './Recommendation';
import Game from './Game';
import Chat from './Chat';
import Real from './Real';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route } from 'react-router-dom';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Login/>} />
      <Route path="/Input" element={<Input />} />
      <Route path="/Analysis" element={<Analysis />} />
      <Route path="/Recommendation" element={<Recommendation />} />
      {/*<Route path="/Game" element={<Game />} />*/}
      <Route path="/Chat" element={<Chat />} />
      <Route path="/Real" element={<Real />} />
    </Routes>
  </BrowserRouter>
);

reportWebVitals();
