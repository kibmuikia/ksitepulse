import { MessageBatcher } from './MessageBatcher';
import { installConsoleProxy } from './consoleProxy';
import { installErrorCapture } from './errorCapture';
import { installPerformanceObservers } from './performanceObserver';

// Guard against double-injection
const w = window as unknown as Record<string, boolean>;
if (!w.__kspInjected) {
  w.__kspInjected = true;

  const batcher = new MessageBatcher();
  installConsoleProxy(batcher);
  installErrorCapture(batcher);
  installPerformanceObservers(batcher);
}
