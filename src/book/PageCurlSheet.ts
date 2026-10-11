import * as THREE from 'three';

export class PageCurlSheet {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly uniforms: {
    uFrontMap: { value: THREE.Texture };
    uBackMap: { value: THREE.Texture };
    uProgress: { value: number };
    uGrabY: { value: number };
    uTwist: { value: number };
    uWidth: { value: number };
    uHeight: { value: number };
  };

  public constructor(width: number, height: number, front: THREE.Texture, back: THREE.Texture) {
    const geometry = new THREE.PlaneGeometry(width, height, 40, 28);
    geometry.translate(width / 2, 0, 0);

    this.uniforms = {
      uFrontMap: { value: front },
      uBackMap: { value: back },
      uProgress: { value: 0 },
      uGrabY: { value: 0.5 },
      uTwist: { value: 0 },
      uWidth: { value: width },
      uHeight: { value: height }
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      transparent: false,
      vertexShader: `
        uniform float uProgress;
        uniform float uGrabY;
        uniform float uTwist;
        uniform float uWidth;
        uniform float uHeight;

        varying vec2 vUv;
        varying float vCurve;
        varying float vTurn;

        const float PI = 3.141592653589793;

        void main() {
          vUv = uv;
          vec3 p = position;

          float pageU = clamp(p.x / uWidth, 0.0, 1.0);
          float pageV = clamp((p.y / uHeight) + 0.5, 0.0, 1.0);

          // The row nearest the grabbed point leads the turn slightly. This breaks the
          // unnatural full-height vertical fold and gives the page a diagonal response.
          float baseArc = sin(uProgress * PI);
          float rowDistance = abs(pageV - uGrabY);
          float localProgress = clamp(uProgress - rowDistance * 0.11 * baseArc, 0.0, 1.0);
          float arc = sin(localProgress * PI);

          // Outer edge travels from +width to -width. The middle control point lifts
          // the sheet into an arch, so the page keeps visible area around mid-turn
          // instead of collapsing into a thin "loading bar" at the spine.
          float edgeX = mix(uWidth, -uWidth, localProgress);
          float controlX = edgeX * 0.5 + uWidth * 0.54 * arc;
          float controlZ = uWidth * 0.78 * arc;

          float t = pageU;
          float invT = 1.0 - t;
          float curveX = 2.0 * invT * t * controlX + t * t * edgeX;
          float curveZ = 2.0 * invT * t * controlZ;

          p.x = curveX;
          p.z += curveZ;

          // Vertical finger movement introduces a small torsion, strongest toward the
          // free edge. The spine stays stable.
          p.y += uTwist * 0.16 * t * t * arc;
          p.z += uTwist * (pageV - uGrabY) * 0.10 * t * arc;

          vCurve = arc * sin(pageU * PI);
          vTurn = localProgress;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uFrontMap;
        uniform sampler2D uBackMap;

        varying vec2 vUv;
        varying float vCurve;
        varying float vTurn;

        void main() {
          vec2 sampleUv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
          vec4 paper = gl_FrontFacing
            ? texture2D(uFrontMap, sampleUv)
            : texture2D(uBackMap, sampleUv);

          // Cheap paper lighting: enough to describe the arch without making the
          // sheet look metallic or plastic.
          float trough = 1.0 - vCurve * 0.16;
          float softHighlight = 1.0 + vCurve * 0.055 * (0.5 + 0.5 * sin(sampleUv.x * 3.14159265));
          float edgeTone = 0.985 + 0.015 * sin(sampleUv.x * 3.14159265);
          float turnTone = mix(1.0, 0.97, smoothstep(0.35, 0.75, vTurn) * vCurve);

          gl_FragColor = vec4(paper.rgb * trough * softHighlight * edgeTone * turnTone, paper.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 5;
  }

  public setProgress(progress: number): void {
    this.uniforms.uProgress.value = THREE.MathUtils.clamp(progress, 0, 1);
  }

  public setGrabY(grabY: number): void {
    this.uniforms.uGrabY.value = THREE.MathUtils.clamp(grabY, 0, 1);
  }

  public setTwist(twist: number): void {
    this.uniforms.uTwist.value = THREE.MathUtils.clamp(twist, -1, 1);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
