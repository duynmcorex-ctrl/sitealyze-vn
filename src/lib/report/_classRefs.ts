/**
 * Re-export helpers dùng chung cho các section report.
 * File này tránh circular import giữa report/sections.ts và analysis/*.ts.
 */
export { getSlopeClasses } from '../analysis/slope';
export { SUITABILITY_CLASSES as SUITABILITY_CLASSES_REF } from '../analysis/suitability';
