import '@fontsource/share-tech-mono/latin-400.css';
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/saira-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });
