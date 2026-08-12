import { EventEmitter } from 'events';

class AppEventEmitter extends EventEmitter {}

const eventEmitter = new AppEventEmitter();

export default eventEmitter; 