// Learning Brain Module — public API
export * from './types';
export * from './db';
export * from './features';
export * from './inference';

// Re-export key functions for convenience
export {
  recordScanEvent,
  recordSignalLifecycleEvent,
  recordExecutionEvent,
  recordUserAction,
  getLiveModel,
  getCoefficients,
} from './db';

export {
  engineerFeatures,
  generateOutcomeLabel,
  calculateBiasAlignment,
  detectHigherTfConflict,
} from './features';

export {
  applyLearningAdjustments,
  modelConfidenceScore,
} from './inference';
