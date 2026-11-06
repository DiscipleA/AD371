import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../styles/pulse-dashboard.css';

const mount = document.getElementById('pulse-root');
if (mount) createRoot(mount).render(<App />);
