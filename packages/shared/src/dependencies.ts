export const MAX_DEPENDENCIES_PER_SERVICE = 50;

/** "serviceId depends on dependsOnId", recorded by hand. */
export type Dependency = { serviceId: number; dependsOnId: number };
