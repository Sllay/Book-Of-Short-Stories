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
  readonly uBackMap: { value: THREE.Texture };
  readonly uPageTranslucency: { value: number };
}

/**
 * A single physical page surface that deforms in the vertex shader while keeping
 * the same MeshStandardMaterial pipeline as resting pages.
 *
 * Front/back selection happens per fragment with gl_FrontFacing on this ONE mesh.
 * There are no coincident front/back meshes, so the curl cannot expose two printed
 * faces in the same place or look transparent because of depth/z overlap.
 *
 * The page intentionally uses symmetric two-sided paper lighting. Three.js normally
 * flips a DoubleSide surface normal on the back face, which makes the underside of
 * our flat-normal curl become much darker under a strong daytime key light. Paper in
 * this reader is visually thin and diffuse, so we cancel that backface-only normal
 * inversion. Front and back therefore inherit the exact same room-light response;
 * only the printed texture changes when the physical side changes.
 */
export class PageCurlSheet {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly uniforms: CurlUniforms;

  public constructor(width: number, height: number, front: THREE.Texture, back: THREE.Texture) {
    this.uniforms = {
      uProgress: { value: 0 },
      uGrabX: { value: 0.9 },
      uGrabY: { value: 0.5 },
      uTwist: { value: 0 },
      uDragAmount: { value: 0 },
      uWidth: { value: width },
      uHeight: { value: height },
      uBackMap: { value: back },
      uPageTranslucency: { value: 0 }
    };

    this.geometry = new THREE.PlaneGeometry(width, height, 44, 30);
    this.geometry.translate(width / 2, 0, 0);

    this.material = createPaperMaterial(front, THREE.DoubleSide);
    this.material.transparent = false;
    this.material.opacity = 1;
    this.material.depthTest = true;
    this.material.depthWrite = true;
    this.installCurlDeformation(this.material);

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 5;
  }

  public setTextures(front: THREE.Texture, back: THREE.Texture): void {
    // Both maps stay allocated for the lifetime of the material, so swapping pages
    // requires no material rebuild and no duplicate 1536x2048 texture.
    this.material.map = front;
    this.uniforms.uBackMap.value = back;
  }

  public setPageTranslucency(enabled: boolean): void {
    // Optional print show-through only. This never enables alpha blending or makes the
    // paper itself transparent; the default (0) is a fully opaque, single-face page.
    this.uniforms.uPageTranslucency.value = enabled ? 0.18 : 0;
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

  /** Compatibility shim kept while V1 reader APIs are stabilized. */
  public setLighting(
    _ambientColor: THREE.Color,
    _keyColor: THREE.Color,
    _keyDirectionWorld: THREE.Vector3,
    _ambientStrength: number,
    _keyStrength: number
  ): void {
    void _ambientColor;
    void _keyColor;
    void _keyDirectionWorld;
    void _ambientStrength;
    void _keyStrength;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
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

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_pars_fragment>',
          `#include <map_pars_fragment>
          uniform sampler2D uBackMap;
          uniform float uPageTranslucency;`
        )
        .replace(
          '#include <map_fragment>',
          `
          #ifdef USE_MAP
            vec4 frontPageSample = texture2D(map, vMapUv);
            vec4 backPageSample = texture2D(uBackMap, vec2(1.0 - vMapUv.x, vMapUv.y));

            #ifdef DECODE_VIDEO_TEXTURE
              frontPageSample = sRGBTransferEOTF(frontPageSample);
              backPageSample = sRGBTransferEOTF(backPageSample);
            #endif

            vec4 visiblePageSample = gl_FrontFacing ? frontPageSample : backPageSample;
            vec4 oppositePageSample = gl_FrontFacing ? backPageSample : frontPageSample;
            vec4 sampledDiffuseColor = mix(visiblePageSample, oppositePageSample, uPageTranslucency);
            diffuseColor *= sampledDiffuseColor;
          #endif
          `
        )
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          // MeshStandardMaterial flips DoubleSide normals on backfaces. Because this
          // curl intentionally keeps page normals flat, that flip makes the back face
          // react like a surface pointing away from the room light. Flip it once more
          // so both physical paper sides use the same canonical paper normal.
          #ifdef DOUBLE_SIDED
            normal *= faceDirection;
          #endif`
        );
    };

    material.customProgramCacheKey = () => 'book-page-curl-single-opaque-surface-v3-symmetric-lighting';
  }
}
