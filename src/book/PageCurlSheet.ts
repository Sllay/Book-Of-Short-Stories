import * as THREE from 'three';
import { createPaperMaterial } from './PaperMaterial';

interface CurlUniforms {
  readonly uProgress: { value: number };
  readonly uGrabX: { value: number };
  readonly uGrabY: { value: number };
  readonly uTwist: { value: number };
  readonly uDragAmount: { value: number };
  readonly uWidth: { value: number };
  readonly uHeight: { value: number };
}

/**
 * A page that deforms in the vertex shader while keeping the exact same
 * MeshStandardMaterial pipeline as the resting pages.
 *
 * Important: normals intentionally remain flat. That means page curl changes only
 * geometry, never the paper's global lighting response. The active sheet therefore
 * cannot become a bright/highlighted foreign object while it is being dragged.
 */
export class PageCurlSheet {
  public readonly mesh = new THREE.Group();

  private readonly frontGeometry: THREE.PlaneGeometry;
  private readonly backGeometry: THREE.PlaneGeometry;
  private readonly frontMaterial: THREE.MeshStandardMaterial;
  private readonly backMaterial: THREE.MeshStandardMaterial;
  private readonly uniforms: CurlUniforms;

  public constructor(width: number, height: number, front: THREE.Texture, back: THREE.Texture) {
    this.uniforms = {
      uProgress: { value: 0 },
      uGrabX: { value: 0.9 },
      uGrabY: { value: 0.5 },
      uTwist: { value: 0 },
      uDragAmount: { value: 0 },
      uWidth: { value: width },
      uHeight: { value: height }
    };

    this.frontGeometry = new THREE.PlaneGeometry(width, height, 44, 30);
    this.frontGeometry.translate(width / 2, 0, 0);

    // The back uses its own tiny vertex/UV buffer so we can mirror the printed page
    // without cloning the 1536x2048 page texture (important on mobile GPU memory).
    this.backGeometry = this.frontGeometry.clone();
    const backUv = this.backGeometry.getAttribute('uv');
    for (let index = 0; index < backUv.count; index += 1) {
      backUv.setX(index, 1 - backUv.getX(index));
    }
    backUv.needsUpdate = true;

    // BackSide materials invert the vertex normal internally. Pre-inverting this
    // geometry cancels that behavior so both paper faces receive the same global
    // room illumination as the stationary pages.
    const backNormal = this.backGeometry.getAttribute('normal');
    for (let index = 0; index < backNormal.count; index += 1) {
      backNormal.setXYZ(
        index,
        -backNormal.getX(index),
        -backNormal.getY(index),
        -backNormal.getZ(index)
      );
    }
    backNormal.needsUpdate = true;

    this.frontMaterial = createPaperMaterial(front, THREE.FrontSide);
    this.backMaterial = createPaperMaterial(back, THREE.BackSide);
    this.installCurlDeformation(this.frontMaterial);
    this.installCurlDeformation(this.backMaterial);

    const frontMesh = new THREE.Mesh(this.frontGeometry, this.frontMaterial);
    const backMesh = new THREE.Mesh(this.backGeometry, this.backMaterial);
    frontMesh.renderOrder = 5;
    backMesh.renderOrder = 5;
    this.mesh.add(frontMesh, backMesh);
  }

  public setTextures(front: THREE.Texture, back: THREE.Texture): void {
    // Maps stay non-null for the whole lifetime, so swapping them does not require a
    // shader recompile. This keeps page turns cheap while preserving material parity.
    this.frontMaterial.map = front;
    this.backMaterial.map = back;
  }

  public setProgress(progress: number): void {
    this.uniforms.uProgress.value = THREE.MathUtils.clamp(progress, 0, 1);
  }

  public setGrabPoint(grabX: number, grabY: number): void {
    this.uniforms.uGrabX.value = THREE.MathUtils.clamp(grabX, 0, 1);
    this.uniforms.uGrabY.value = THREE.MathUtils.clamp(grabY, 0, 1);
  }

  public setTwist(twist: number): void {
    this.uniforms.uTwist.value = THREE.MathUtils.clamp(twist, -1, 1);
  }

  public setDragAmount(amount: number): void {
    this.uniforms.uDragAmount.value = THREE.MathUtils.clamp(amount, 0, 1);
  }

  public dispose(): void {
    this.frontGeometry.dispose();
    this.backGeometry.dispose();
    this.frontMaterial.dispose();
    this.backMaterial.dispose();
  }

  private installCurlDeformation(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uProgress;
          uniform float uGrabX;
          uniform float uGrabY;
          uniform float uTwist;
          uniform float uDragAmount;
          uniform float uWidth;
          uniform float uHeight;`
        )
        .replace(
          '#include <begin_vertex>',
          `
          vec3 transformed = vec3(position);

          float pageU = clamp(transformed.x / uWidth, 0.0, 1.0);
          float pageV = clamp((transformed.y / uHeight) + 0.5, 0.0, 1.0);
          vec2 pageUv = vec2(pageU, pageV);
          vec2 grabUv = vec2(uGrabX, uGrabY);

          float baseArc = sin(uProgress * PI);
          float rowDistance = abs(pageV - uGrabY);
          float grabDistance = distance(pageUv, grabUv);
          float grabInfluence = exp(-grabDistance * 4.5);

          float touchLead = grabInfluence * 0.13 * baseArc;
          float rowLag = rowDistance * mix(0.20, 0.10, uGrabX) * baseArc;
          float spineLag = (1.0 - pageU) * 0.025 * baseArc;
          float localProgress = clamp(uProgress + touchLead - rowLag - spineLag, 0.0, 1.0);
          float arc = sin(localProgress * PI);

          float edgeX = mix(uWidth, -uWidth, localProgress);
          float controlX = edgeX * 0.5 + uWidth * (0.50 + 0.08 * grabInfluence) * arc;
          float controlZ = uWidth * (0.72 + 0.12 * grabInfluence) * arc;

          float t = pageU;
          float invT = 1.0 - t;
          transformed.x = 2.0 * invT * t * controlX + t * t * edgeX;
          transformed.z += 2.0 * invT * t * controlZ;

          float grabBias = (uGrabY - 0.5) * 2.0;
          transformed.y += grabBias * 0.055 * t * t * arc;
          transformed.y += uTwist * 0.17 * t * t * arc;
          transformed.z += uTwist * (pageV - uGrabY) * 0.13 * t * arc;

          float dragEnvelope = uDragAmount * arc * smoothstep(0.06, 0.52, pageU);
          float waveA = sin(pageU * 35.0 + pageV * 21.0 + uProgress * 4.0);
          float waveB = sin(pageU * 17.0 - pageV * 31.0 - uProgress * 3.0);
          float radial = sin(grabDistance * 68.0 - uProgress * 5.0) * exp(-grabDistance * 6.5);
          float wrinkle = (waveA * 0.62 + waveB * 0.38) * 0.012;
          wrinkle += radial * 0.010;
          wrinkle *= dragEnvelope * (0.28 + 0.72 * grabInfluence);

          transformed.z += wrinkle;
          transformed.y += wrinkle * 0.20 * (0.35 + pageU);
          `
        );
    };

    material.customProgramCacheKey = () => 'book-page-curl-standard-material-v1';
  }
}
