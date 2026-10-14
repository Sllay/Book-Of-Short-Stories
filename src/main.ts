import './styles.css';
import './bookPresentation.css';
import { App } from './core/App';
import { registerPwa } from './pwa/register';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root #app was not found.');

const app = new App(root);
app.start();
registerPwa();
