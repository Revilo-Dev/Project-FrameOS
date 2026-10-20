import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/app.css';
import './styles/weather.css';
import './styles/refinement.css';
import './styles/media-player.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
