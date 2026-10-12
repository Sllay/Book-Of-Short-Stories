import * as THREE from 'three';

/**
 * Creates the canonical paper material used by every visible page surface.
 * Keeping this in one place prevents the turning sheet from drifting into a
 * different color/roughness/lighting response than the resting pages.
 */
export function createPaperMaterial(
  map: THREE.Texture,
  side: THREE.Side = THREE.DoubleSide
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    side
  });
}
