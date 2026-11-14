// Visionneuse 3D (aperçu manipulable, mode provenance, comparaison photo 360°). Pensée pour Safari iPhone.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Viewer {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xb9cbe0); this.scene.fog = new THREE.Fog(0xb9cbe0, 600, 2500);
    const pm = new THREE.PMREMGenerator(r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.3, 5000); this.camera.position.set(80, 60, 80);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495;
    this.scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x5a5348, 0.9));
    const sun = this.sun = new THREE.DirectionalLight(0xfff3df, 2.4); sun.position.set(-120, 200, 90); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4; this.scene.add(sun, sun.target);
    this.model = null; this.pano = null; this.mode = 'normal';
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement); this.resize();
    const loop = () => { if (!this.paused) { this.controls.update(); r.render(this.scene, this.camera); } requestAnimationFrame(loop); }; loop();
  }
  resize() { const p = this.renderer.domElement.parentElement, w = p.clientWidth, h = p.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  setModel(root) {
    if (this.model) { this.scene.remove(this.model); dispose(this.model); }
    this.model = root; this.scene.add(root); this.orig = new Map(); root.traverse(o => { if (o.isMesh) this.orig.set(o, o.material); });
    this.frame();
  }
  frame() {
    const box = new THREE.Box3(); this.model.traverse(o => { if (o.isMesh && o.parent.name !== 'Environnement_mesure' && !o.name.includes('genere')) box.expandByObject(o); });
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), R = Math.max(s.x, s.y, s.z);
    this.controls.target.copy(c); this.camera.position.set(c.x + R * 0.55, c.y + R * 0.45, c.z + R * 0.75); this.camera.near = Math.max(0.3, R / 2000); this.camera.far = R * 30; this.camera.updateProjectionMatrix();
    const sh = this.sun.shadow.camera, h = R * 0.7; sh.left = -h; sh.right = h; sh.top = h; sh.bottom = -h; sh.near = 1; sh.far = R * 6; sh.updateProjectionMatrix();
    this.sun.target.position.copy(c); this.sun.position.copy(c).add(new THREE.Vector3(-0.5, 0.75, 0.45).multiplyScalar(R * 2));
  }
  setProvenanceMode(on, provMats) {
    this.mode = on ? 'provenance' : 'normal';
    this.model.traverse(o => {
      if (!o.isMesh) return;
      const k = o.userData.provenance;
      if (on && provMats) { const m = o.name === 'Fenetres_cadres' ? provMats.cadres : provMats[k]; if (m) o.material = m; }
      else o.material = this.orig.get(o);
    });
  }
  setVisible(nameStart, v) { this.model?.traverse(o => { if (o.name.startsWith(nameStart)) o.visible = v; }); }
  setOpacity(a) {
    this.model?.traverse(o => { if (!o.isMesh || o.parent?.name === 'Environnement_mesure' || /INTERIEUR/.test(o.parent?.name || '')) return; const m = o.material; if (m.userData.op0 === undefined) { m.userData.op0 = m.opacity; m.userData.tr0 = m.transparent; } m.transparent = a < 1 || m.userData.tr0; m.opacity = m.userData.op0 * a; m.needsUpdate = true; });
  }
  // ---- comparaison avec une photo 360° : on se place à la position GPS de la photo ----
  enterPhoto(ph, R) {
    this.exitPhoto();
    const tex = new THREE.CanvasTexture(ph.pix.canvas); tex.colorSpace = THREE.SRGBColorSpace;
    let geo; if (ph.spherical) { geo = new THREE.SphereGeometry(900, 64, 32); geo.scale(-1, 1, 1); }
    else { const w = 2 * 900 * Math.tan(ph.fov * Math.PI / 360), h = w * ph.pix.H / ph.pix.W; geo = new THREE.PlaneGeometry(w, h); geo.translate(0, 0, -900); geo.rotateY(Math.PI); }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, fog: false, toneMapped: false })); mesh.renderOrder = -1;
    const p = new THREE.Vector3(ph.cam.x, ph.cam.z - R.z0, -ph.cam.y); mesh.position.copy(p);
    mesh.rotation.y = ph.spherical ? -(ph.azimuth - 270) * Math.PI / 180 : -(ph.azimuth) * Math.PI / 180 + Math.PI;
    this.pano = mesh; this.scene.add(mesh); this.saved = { pos: this.camera.position.clone(), tgt: this.controls.target.clone(), fov: this.camera.fov, bg: this.scene.background };
    this.setVisible('Environnement_mesure', false); this.scene.fog = null;
    const dir = new THREE.Vector3(-ph.cam.x, 0, ph.cam.y).normalize();
    this.camera.position.copy(p); this.controls.target.copy(p).addScaledVector(dir, 0.5); this.camera.fov = 60; this.camera.near = 0.3; this.camera.far = 3000; this.camera.updateProjectionMatrix();
    this.controls.enableZoom = false; this.controls.enablePan = false; this.controls.maxPolarAngle = Math.PI; this.controls.rotateSpeed = -0.4;
  }
  exitPhoto() {
    if (!this.pano) return; this.scene.remove(this.pano); this.pano.material.map.dispose(); this.pano.geometry.dispose(); this.pano = null;
    this.camera.position.copy(this.saved.pos); this.controls.target.copy(this.saved.tgt); this.camera.fov = this.saved.fov; this.camera.updateProjectionMatrix();
    this.controls.enableZoom = true; this.controls.enablePan = true; this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.rotateSpeed = 1;
    this.setVisible('Environnement_mesure', true); this.setOpacity(1); this.scene.fog = new THREE.Fog(0xb9cbe0, 600, 2500); this.frame();
  }
  renderToCanvas(cam, W, H, { hideEnvironment } = {}) {
    if (hideEnvironment) this.setVisible('Environnement_mesure', false);
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const bg = this.scene.background; this.scene.background = null;
    this.renderer.setRenderTarget(rt); this.renderer.setClearColor(0x000000, 0); this.renderer.clear(); this.renderer.render(this.scene, cam); this.renderer.setRenderTarget(null);
    this.scene.background = bg; if (hideEnvironment) this.setVisible('Environnement_mesure', true);
    const px = new Uint8Array(W * H * 4); this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0); return c;
  }
}
function dispose(o) { o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
