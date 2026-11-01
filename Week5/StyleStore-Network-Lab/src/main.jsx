import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import '../styles/storefront.css';

const mount = document.getElementById('stylestore-root');
if (mount) createRoot(mount).render(<App />);
