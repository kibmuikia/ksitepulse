export const VITAL_TIPS: Record<string, string> = {
  LCP: 'Largest Contentful Paint — how long until the biggest visible element loads. Good: <2.5s, Poor: >4s.',
  FCP: 'First Contentful Paint — time until first text or image appears. Good: <1.8s, Poor: >3s.',
  INP: 'Interaction to Next Paint — responsiveness to clicks/taps. Good: <200ms, Poor: >500ms.',
  FID: 'First Input Delay — delay before the browser responds to the first interaction. Good: <100ms.',
  CLS: 'Cumulative Layout Shift — visual stability; measures unexpected layout shifts. Good: <0.1.',
  TTFB: 'Time to First Byte — server response speed. Good: <800ms, Poor: >1800ms.',
};
