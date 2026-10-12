import * as THREE from 'three';

export class PageCurlSheet {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  private readonly uniforms: {
    uFrontMap: { value: THREE.Texture };
    uBackMap: { value: THREE.Texture };
    uProgress: { value: number };
    uGrabX: { value: number };
    uGrabY: { value: number };
    uTwist: { value: number };
    uDragAmount: { value: number };
    uWidth: { value: number };
    uHeight: { value: number };
  };

  public constructor(width: number, height: number, front: THREE.Texture, back: THREE.Texture) {
    const geometry = new THREE.PlaneGeometry(width, height, 44, 30);
    geometry.translate(width / 2, 0, 0);

    this.uniforms = {
      uFrontMap: { value: front },
      uBackMap: { value: back },
      uProgress: { value: 0 },
      uGrabX: { value: 0.9 },
      uGrabY: { value: 0.5 },
      uTwist: { value: 0 },
      uDragAmount: { value: 0 },
      uWidth: { value: width },
      uHeight: { value: height }
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      blending: THREE.NoBlending,
      vertexShader: `
        uniform float uProgress;
        uniform float uGrabX;
        uniform float uGrabY;
        uniform float uTwist;
        uniform float uDragAmount;
        uniform float uWidth;
        uniform float uHeight;

        varying vec2 vUv;
        varying float vCurve;
        varying float vTurn;
        varying float vWrinkle;
        varying float vGrabInfluence;

        const float PI = 3.141592653589793;

        void main() {
          vUv = uv;
          vec3 p = position;

          float pageU = clamp(p.x / uWidth, 0.0, 1.0);
          float pageV = clamp((p.y / uHeight) + 0.5, 0.0, 1.0);
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
          float curveX = 2.0 * invT * t * controlX + t * t * edgeX;
          float curveZ = 2.0 * invT * t * controlZ;

          p.x = curveX;
          p.z += curveZ;

          float grabBias = (uGrabY - 0.5) * 2.0;
          p.y += grabBias * 0.055 * t * t * arc;
          p.y += uTwist * 0.17 * t * t * arc;
          p.z += uTwist * (pageV - uGrabY) * 0.13 * t * arc;

          float dragEnvelope = uDragAmount * arc * smoothstep(0.06, 0.52, pageU);
          float waveA = sin(pageU * 35.0 + pageV * 21.0 + uProgress * 4.0);
          float waveB = sin(pageU * 17.0 - pageV * 31.0 - uProgress * 3.0);
          float radial = sin(grabDistance * 68.0 - uProgress * 5.0) * exp(-grabDistance * 6.5);
          float wrinkle = (waveA * 0.62 + waveB * 0.38) * 0.012;
          wrinkle += radial * 0.010;
          wrinkle *= dragEnvelope * (0.28 + 0.72 * grabInfluence);

          p.z += wrinkle;
          p.y += wrinkle * 0.20 * (0.35 + pageU);

          vCurve = arc * sin(pageU * PI);
          vTurn = localProgress;
          vWrinkle = wrinkle / 0.022;
          vGrabInfluence = grabInfluence;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uFrontMap;
        uniform sampler2D uBackMap;

        varying vec2 vUv;
        varying float vCurve;
        varying float vTurn;
        varying float vWrinkle;
        varying float vGrabInfluence;

        void main() {
          vec2 sampleUv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
          vec3 paper = gl_FrontFacing
            ? texture2D(uFrontMap, sampleUv).rgb
            : texture2D(uBackMap, sampleUv).rgb;

          // The turning sheet is a custom unlit shader while the resting pages use
          // MeshStandardMaterial. Without a common paper tone the active sheet reads
          // as a bright white overlay. Keep the same warm/dim family as the book and
          // let curl shading provide movement instead of changing the paper color.
          const vec3 globalPaperTone = vec3(0.78, 0.745, 0.69);
          float trough = 1.0 - vCurve * 0.13;
          float softHighlight = 1.0 + vCurve * 0.018 * (0.5 + 0.5 * sin(sampleUv.x * 3.14159265));
          float edgeTone = 0.982 + 0.012 * sin(sampleUv.x * 3.14159265);
          float turnTone = mix(1.0, 0.972, smoothstep(0.35, 0.75, vTurn) * vCurve);
          float wrinkleShade = 1.0 + clamp(vWrinkle, -1.0, 1.0) * 0.018 * (0.35 + 0.65 * vGrabInfluence);

          gl_FragColor = vec4(paper * globalPaperTone * trough * softHighlight * edgeTone * turnTone * wrinkleShade, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 5;
  }

  public setTextures(front: THREE.Texture, back: THREE.Texture): void {
    this.uniforms.uFrontMap.value = front;
    this.uniforms.uBackMap.value = back;
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
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
