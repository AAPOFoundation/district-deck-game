import * as THREE from 'three';
import { registerPhotoMaterial } from './photo-shadow-registration.js';

// The same iterators serve captures (synchronous) and the public loading screen.
// A promise microtask alone cannot let the browser paint or handle input.
export function yieldToBrowser() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

export function finishBuild(steps) {
  let result;
  do { result = steps.next(); } while (!result.done);
  return result.value;
}

export function buildBudget(ms = 25, now = () => performance.now()) {
  let deadline = now() + ms;
  return () => {
    const time = now();
    if (time < deadline) return false;
    deadline = time + ms;
    return true;
  };
}

// Strings begin stages; null checkpoints continue the current stage. Timing is
// CPU work between next() calls, excluding browser yields and progress callbacks.
export async function runBuild(steps, {
  onProgress = () => {}, onTiming = () => {}, yieldTask = yieldToBrowser,
} = {}) {
  let stage = 'setup', elapsed = 0, longest = 0, yields = 0;
  try {
    for (;;) {
      const start = performance.now();
      const result = steps.next();
      const ms = performance.now() - start;
      elapsed += ms;
      longest = Math.max(longest, ms);
      if (result.done || typeof result.value === 'string') {
        onTiming({ stage, ms: elapsed, longestMs: longest, yields });
        if (result.done) return result.value;
        stage = result.value;
        elapsed = 0; longest = 0; yields = 0;
        onProgress(stage);
      }
      yields += 1;
      await yieldTask();
    }
  } finally {
    steps.return?.();
  }
}

export function showStartupError(loader, error) {
  if (loader) {
    // COPY-DRAFT: startup failure, kept on the loading panel.
    loader.textContent = `Could not start: ${error.message}`;
    loader.setAttribute?.('role', 'alert');
  }
}

// compileAsync starts programs synchronously before polling KHR completion.
// Limit each submission too. Borrow references for traversal only: never add(),
// reparent, hide or reorder the live scene, and keep its lights/fog/environment.
export async function compileSceneAsync(renderer, scene, camera, {
  yieldTask = yieldToBrowser, batchSize = 32,
} = {}) {
  const objects = [];
  scene.traverse(object => {
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) objects.push(object);
  });
  for (let i = 0; i < objects.length; i += batchSize) {
    await yieldTask();
    const slice = objects.slice(i, i + batchSize);
    const subset = {
      traverse: callback => slice.forEach(callback),
      traverseVisible: () => {}, // Lights come from targetScene, exactly once.
    };
    await renderer.compileAsync(subset, camera, scene);
  }
}

// Embedded GLB images already have their bytes in memory. ImageBitmapLoader's
// object-URL -> fetch -> Blob route copies those bytes again and bills them as
// responses in load probes (the people PNGs alone are about 227 MB). Preserve
// GLTFLoader's source cache, texture cloning and decoder options, without URLs.
// Installed only by the staged factory; the synchronous rollback is unchanged.
export function installEmbeddedImageDecoder(loader) {
  if (typeof globalThis.createImageBitmap !== 'function') return;
  loader.register(parser => {
    const original = parser.loadImageSource;
    parser.loadImageSource = function(index, imageLoader) {
      const source = this.json.images[index];
      if (source.bufferView === undefined || !imageLoader.isImageBitmapLoader) {
        return original.call(this, index, imageLoader);
      }
      if (this.sourceCache[index]) return this.sourceCache[index].then(texture => texture.clone());
      const pending = this.getDependency('bufferView', source.bufferView).then(async bytes => {
        const bitmap = await createImageBitmap(new Blob([bytes], { type: source.mimeType }),
          { ...imageLoader.options, colorSpaceConversion: 'none' });
        const texture = new THREE.Texture(bitmap);
        texture.needsUpdate = true;
        if (source.extras && typeof source.extras === 'object') Object.assign(texture.userData, source.extras);
        texture.userData.mimeType = source.mimeType;
        return texture;
      });
      this.sourceCache[index] = pending;
      return pending;
    };
    return { name: 'DD_embedded_image_decode' };
  });
}

export function yieldBootFrame() {
  if (typeof requestAnimationFrame !== 'function') return yieldToBrowser();
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// An individual driver call cannot be preempted. Stop each batch at the CPU
// budget or item cap, and reduce later draw batches when the driver runs long.
export async function runWarmBatches(items, work, {
  yieldTask = yieldBootFrame, now = () => performance.now(), budgetMs = 150,
  batchSize = 4, onBatch = () => {},
} = {}) {
  for (let i = 0; i < items.length;) {
    await yieldTask();
    const start = now(), begin = i;
    do { await work(items[i++]); }
    while (i < items.length && i - begin < batchSize && now() - start < budgetMs);
    onBatch({ count: i - begin, ms: now() - start });
  }
}

// Local, synchronous transactions only: no live flag remains changed over an
// await, including driver errors. Restore descriptors, not merely their values.
function withFlags(changes, work) {
  const saved = [];
  try {
    for (const [object, key, value] of changes) {
      if (!object) continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor && !descriptor.configurable && !descriptor.writable) continue;
      saved.push([object, key, descriptor]);
      Object.defineProperty(object, key, descriptor?.configurable === false
        ? { ...descriptor, value } : { configurable: true, enumerable: true, writable: true, value });
    }
    return work();
  } finally {
    for (const [object, key, descriptor] of saved.reverse()) {
      if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key];
    }
  }
}

function preserveRenderer(renderer, work) {
  const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest(), colour = renderer.getClearColor(new THREE.Color());
  const alpha = renderer.getClearAlpha();
  try {
    return withFlags([
      ...['enabled', 'autoUpdate', 'needsUpdate', 'type'].map(key => [renderer.shadowMap, key, renderer.shadowMap[key]]),
      ...['autoClear', 'sortObjects'].map(key => [renderer, key, renderer[key]]),
    ], work);
  } finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
    renderer.setClearColor(colour, alpha);
  }
}

function renderObjects(scene) {
  const objects = [], lights = [];
  scene.traverseVisible(object => {
    if (object.isLight) lights.push(object);
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) objects.push(object);
  });
  return { objects, lights };
}

function sceneTextures(scene, objects) {
  const textures = new Set(), materials = new Set();
  const add = value => {
    if (value?.isTexture) {
      // Render/depth attachments are allocated by initRenderTarget, not initTexture.
      if (!value.isRenderTargetTexture && !value.isDepthTexture) textures.add(value);
    } else if (Array.isArray(value)) value.forEach(add);
  };
  add(scene.environment); add(scene.background); add(scene.userData?.ddSkyEnvironment);
  for (const object of objects) {
    for (const material of [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat()) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      Object.values(material).forEach(add);
      for (const uniform of Object.values(material.uniforms ?? {})) add(uniform.value);
    }
  }
  return [...textures];
}

const noHook = () => {};
function preserveDrawState(objects, work) {
  const matrices = [], changes = [];
  for (const object of objects) {
    for (const key of ['visible', 'material', 'geometry', 'instanceMatrix', 'count']) changes.push([object, key, object[key]]);
    changes.push([object.layers, 'mask', object.layers.mask]);
    for (const key of ['matrix', 'matrixWorld']) matrices.push([object[key], object[key].clone()]);
  }
  try { return withFlags(changes, work); }
  finally { for (const [matrix, saved] of matrices) matrix.copy(saved); }
}

function borrowDraws(scene, objects, lights, work) {
  // Borrow exact GPU resource owners, without reparenting or cloning buffers.
  // Flatten just for this synchronous draw, so nested mesh children cannot make
  // a small batch unbounded. Gameplay/one-shot render hooks run on the real frame.
  const subset = new THREE.Scene();
  for (const key of ['background', 'environment', 'fog', 'overrideMaterial', 'backgroundBlurriness',
    'backgroundIntensity', 'backgroundRotation', 'environmentIntensity', 'environmentRotation', 'userData']) subset[key] = scene[key];
  subset.matrixWorldAutoUpdate = false;
  subset.children = [...lights, ...objects];
  const changes = [];
  for (const object of new Set(subset.children)) {
    changes.push([object, 'children', []], [object, 'frustumCulled', false]);
    for (const hook of ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']) changes.push([object, hook, noHook]);
  }
  return withFlags(changes, () => work(subset));
}

/** GPU resources only. Never calls step/update, Clock, post.render or proxy sync. */
export async function warmStart(view, options = {}) {
  try {
    await warmGpuResources(view, options);
  } catch (error) {
    // Preparation is optional: construction succeeded, so let the ordinary
    // first frame initialise any resources that could not be warmed here.
    const message = error?.message ?? String(error);
    if (globalThis.window) (window.__ddBootTrace ??= []).push({ stage: 'warmup', phase: 'error', message });
    console.warn('GPU warm-up failed; continuing with the first frame.', error);
  }
}

async function warmGpuResources(view, {
  yieldTask = yieldBootFrame, onProgress = () => {}, budgetMs = 150, batchSize = 32,
  now = () => performance.now(),
} = {}) {
  const { renderer, scene, camera, post } = view;
  const passes = post?.enabled ? post.passes ?? [] : [];
  let trace, target, outputTarget;
  try {
    trace = bootTrace(view, 'warmup');
    target = post?.enabled ? post.sceneTarget.clone() : new THREE.WebGLRenderTarget(8, 8);
    target.setSize(8, 8);
    if (!post?.enabled) target.texture.colorSpace = renderer.outputColorSpace;
    outputTarget = new THREE.WebGLRenderTarget(8, 8);
    outputTarget.texture.colorSpace = renderer.outputColorSpace;
    const shadowCamera = Object.create(camera);
    shadowCamera.layers = new THREE.Layers();
    shadowCamera.layers.mask = camera.layers.mask | (view.shadowProxy ? 1 << view.shadowProxy.layer : 0);
    const phase = async (name, work) => {
      await yieldTask();
      const start = now();
      trace.measure(name, () => preserveRenderer(renderer, work));
      return now() - start;
    };
    const shadowLights = lights => lights.filter(light => light.castShadow && light.shadow && light.layers.test(shadowCamera.layers));
    const drawShadow = (light, world, objects, lights) => withFlags([
      [renderer.shadowMap, 'autoUpdate', false], [renderer.shadowMap, 'needsUpdate', true],
      ...shadowLights(lights).flatMap(other => [
        [other.shadow, 'autoUpdate', false], [other.shadow, 'needsUpdate', other === light],
      ]),
    ], () => {
      renderer.setRenderTarget(target);
      // The installed shadow wrapper is invoked by renderer.render, after Three
      // establishes its render state. A borrowed scene avoids live proxy history;
      // the temporary camera admits its shadow-only geometry without changing ours.
      borrowDraws(world, objects, lights, subset => {
        if (!objects.length) subset.background = null;
        renderer.render(subset, shadowCamera);
      });
    });
    // COPY-DRAFT: GPU preparation progress on the existing loading panel.
    onProgress('Uploading the city textures');
    // The pool starts loading during construction but mounts its shells on the
    // first people tick. Include the loaded templates now: their maps and
    // geometry are shared by those shells, otherwise the first frame still
    // uploads the large people PNGs even after the city itself has been warmed.
    await view.meshyPeople?._load;
    scene.updateMatrixWorld(true);
    const worlds = [scene, view.water?._reflector?.scene, ...passes.map(pass => pass.scene)].filter(Boolean);
    const inventories = worlds.map(world => ({ world, ...renderObjects(world) }));
    for (const template of view.meshyPeople?.templates?.values() ?? []) {
      inventories[0].objects.push(...renderObjects(template.gltf.scene).objects);
    }
    const textures = [...new Set(inventories.flatMap(({ world, objects }) => sceneTextures(world, objects)))];
    await runWarmBatches(textures, texture => trace.measure('texture-upload', () => renderer.initTexture(texture)),
      { yieldTask, now, budgetMs, batchSize: 4 });
    // PCF colour shaders need real depth-compare attachments, including the
    // other cascade when only one is being warmed. Allocate/clear every map
    // through an empty render before submitting any colour geometry.
    const initialised = new Set();
    if (renderer.shadowMap.enabled) for (const { world, lights } of inventories) {
      for (const light of shadowLights(lights)) {
        if (initialised.has(light)) continue;
        await phase('shadow-init', () => drawShadow(light, world, [], lights));
        initialised.add(light);
      }
    }
    onProgress('Preparing the city geometry');
    for (const { world, objects, lights: worldLights } of inventories.slice(0, view.water?._reflector ? 2 : 1)) {
      let size = Math.max(1, Math.min(128, batchSize));
      for (let i = 0; i < objects.length;) {
        const slice = objects.slice(i, i + size); i += slice.length;
        // The normal renderBufferDirect hook installs these at the first draw.
        // compileAsync alone never visits that hook, so previously it compiled
        // the pre-CSM variant and the first frame compiled the real one again.
        if (view.photoCSM && view._photoMaterials) for (const object of slice) {
          for (const material of [object.material].flat()) registerPhotoMaterial(material, view.photoCSM, view._photoMaterials);
        }
        // compileAsync polls driver completion; the small borrowed scene already
        // contains its lights, avoiding a full city walk for every compile batch.
        await yieldTask();
        const compileStart = now();
        const pending = trace.measure('compile-submit', () => preserveRenderer(renderer, () => {
          renderer.setRenderTarget(target);
          return borrowDraws(world, slice, worldLights, subset => renderer.compileAsync(subset, camera));
        }));
        let longestMs = now() - compileStart;
        await pending;
        longestMs = Math.max(longestMs, await phase('geometry-colour', () => {
          renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
          renderer.setRenderTarget(target);
          borrowDraws(world, slice, worldLights, subset => renderer.render(subset, camera));
        }));
        if (world === scene && !post?.enabled) {
          // Direct-to-canvas ACES uses a different program from an offscreen
          // render target. Compile that final variant without presenting it.
          await yieldTask();
          await preserveRenderer(renderer, () => {
            renderer.setRenderTarget(null);
            return borrowDraws(world, slice, worldLights, subset => renderer.compileAsync(subset, camera));
          });
        }
        if (renderer.shadowMap.enabled) for (const [index, light] of shadowLights(worldLights).entries()) {
          longestMs = Math.max(longestMs, await phase(`geometry-shadow-${index}`,
            () => drawShadow(light, world, slice, worldLights)));
        }
        // Respond to the slowest synchronous phase, including shader submission.
        // Driver polling and frame waits do not consume the main-thread budget.
        size = Math.max(1, Math.min(128, Math.floor(size * Math.min(2, budgetMs / Math.max(1, longestMs)))));
      }
    }
    onProgress('Preparing the shadows and reflections');
    // These provisional subset maps are never presented. The ordinary first
    // frame redraws complete maps with resident buffers and the live proxy sync,
    // avoiding an unbounded full-scene colour pass during shadow preparation.
    const reflector = view.water?._reflector;
    if (reflector) await phase('reflection', () => withFlags([
      [reflector, '_reflectCadence', reflector._reflectCadence], [reflector, '_drewOnce', false],
      [reflector.scene, 'fog', reflector.scene.fog],
    ], () => preserveDrawState(reflector.proxies ?? [], () => reflector.render(renderer, camera, scene))));
    // Allocate at final size one target per frame. Draw quads directly so TAA
    // history, jitter, dither and frameIndex remain exactly at their opening state.
    onProgress('Preparing the picture layers');
    for (const attachment of post?.enabled ? post.targets ?? [] : []) await phase('post-target', () => renderer.initRenderTarget(attachment));
    if (post?.enabled) await phase('foliage-mask', () => withFlags([
      [post, '_foliageMaskStamp', post._foliageMaskStamp],
    ], () => preserveDrawState((post._foliageMaskProxies ?? []).map(pair => pair.proxy),
      () => post._renderFoliageMask(renderer, camera))));
    for (const [index, pass] of passes.entries()) {
      await yieldTask();
      const passTarget = pass === post.gradePass ? outputTarget : target;
      await preserveRenderer(renderer, () => {
        renderer.setRenderTarget(passTarget);
        return renderer.compileAsync(pass.scene, pass.camera);
      });
      await phase(`post-${index}`, () => {
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
        pass.render(renderer, passTarget);
      });
    }
  } finally {
    try { target?.dispose(); }
    finally { try { outputTarget?.dispose(); } finally { trace?.finish(); } }
  }
}

// CPU wall time and actual GL upload calls, not GPU timer estimates. Nested
// phase durations are inclusive. All instrumentation is opt-in and temporary.
export function bootTrace(view, stage, { host = globalThis.window, timing = performance } = {}) {
  const noop = { measure: (_name, work) => work(), finish: () => {} };
  if (!host || new URLSearchParams(host.location?.search ?? '').get('bootTrace') !== '1') return noop;
  const rows = host.__ddBootTrace ??= [], undo = [];
  const counts = { textureUploadCount: 0, geometryUploadCount: 0 };
  const patch = (object, key, wrap) => {
    if (typeof object?.[key] !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(object, key), original = object[key];
    object[key] = wrap(original);
    undo.push(() => { if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key]; });
  };
  let serial = rows.length, finished = false;
  const begin = phase => {
    const name = `dd-boot:${stage}:${phase}:${serial++}`, start = timing.now(), before = { ...counts };
    timing.mark(name);
    return () => {
      const end = `${name}:end`; timing.mark(end); timing.measure(name, name, end);
      rows.push({ stage, phase, startTime: start, duration: timing.now() - start,
        textureUploadCount: counts.textureUploadCount - before.textureUploadCount,
        geometryUploadCount: counts.geometryUploadCount - before.geometryUploadCount });
    };
  };
  const measure = (phase, work) => { const end = begin(phase); try { return work(); } finally { end(); } };
  const gl = view.renderer.getContext?.();
  for (const key of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D']) {
    patch(gl, key, original => function(...args) { counts.textureUploadCount++; return original.apply(this, args); });
  }
  for (const key of ['bufferData', 'bufferSubData']) {
    patch(gl, key, original => function(...args) { counts.geometryUploadCount++; return original.apply(this, args); });
  }
  patch(view.renderer, 'render', original => function(world, camera) {
    const postIndex = (view.post?.passes ?? []).findIndex(pass => pass.scene === world);
    const phase = world === view.scene ? 'colour' : world === view.water?._reflector?.scene ? 'reflection'
      : world === view.post?._foliageMaskScene ? 'foliage-mask' : postIndex >= 0 ? `post-${postIndex}` : 'batch';
    return measure(phase, () => original.call(this, world, camera));
  });
  patch(view.post, 'render', original => function(...args) { return measure('post', () => original.apply(this, args)); });
  patch(view.water, 'renderReflection', original => function(...args) { return measure('reflection-pass', () => original.apply(this, args)); });
  let endShadow = null;
  patch(view.renderer, 'setRenderTarget', original => function(target, ...rest) {
    if (endShadow) { endShadow(); endShadow = null; }
    const index = (view.photoCSM?.lights ?? []).findIndex(light => target && light.shadow.map === target);
    if (index >= 0) endShadow = begin(index === 0 ? 'shadow-near' : 'shadow-far');
    return original.call(this, target, ...rest);
  });
  const end = begin('total');
  return { measure, finish() {
    if (finished) return; finished = true;
    if (endShadow) endShadow();
    end(); for (const restore of undo.reverse()) restore();
  } };
}
