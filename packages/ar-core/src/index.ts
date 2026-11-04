/**
 * @webar/ar-core — base de realidad aumentada web sobre three.js.
 *
 * No sabe nada de la aplicación (átomos, moléculas…): da una sesión, anclas y
 * proveedores de seguimiento intercambiables. Ver README.md de este paquete.
 */
export { ARSession, type ARSessionOptions } from './session';
export { ARAnchor, type ARAnchorEvents } from './anchor';
export { Emitter } from './emitter';
export { detectARSupport, type ARSupport } from './capabilities';
export { WebXRWorldProvider, type WebXRWorldOptions } from './providers/webxr-world';
export { ViewerProvider, type ViewerOptions } from './providers/viewer';
export { MarkerTrackingProvider, type MarkerTrackingEvents, type MarkerTrackingOptions } from './providers/marker-tracking';
export { MARKER_COUNT, MARKER_DICTIONARY, markerSVG } from './markers';
export { homography, markerPose, type PinholeCamera, type Point2 } from './pose';
export { refineCorners, type GreyImage } from './refine';
export { OneEuroQuaternion, OneEuroVector, type OneEuroOptions } from './one-euro';
export type { ARCapability, ARContext, ARProvider, ARProviderHooks, ARSessionEvents } from './types';
