/**
 * Thin WebGL2 helpers.
 *
 * Just enough sugar over the raw API to keep the renderer readable: program
 * compilation with useful error messages, uniform caching, static meshes and
 * render targets. No abstraction layer, no scene graph, no engine.
 */

export function compile(gl, type, source, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    // Number the source so the reported line actually helps.
    const numbered = source
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(3, ' ')}| ${l}`)
      .join('\n');
    throw new Error(`Shader compile failed (${label}):\n${log}\n${numbered}`);
  }
  return sh;
}

export class Program {
  constructor(gl, vsSource, fsSource, label = 'program') {
    this.gl = gl;
    this.label = label;
    const vs = compile(gl, gl.VERTEX_SHADER, vsSource, `${label}.vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource, `${label}.frag`);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`Program link failed (${label}): ${log}`);
    }
    this.program = p;
    this.uniforms = new Map();
    this.attribs = new Map();

    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      this.attribs.set(info.name, gl.getAttribLocation(p, info.name));
    }
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(name, gl.getUniformLocation(p, name));
    }
  }

  use() {
    this.gl.useProgram(this.program);
    return this;
  }

  loc(name) {
    return this.uniforms.get(name);
  }

  int(name, v) {
    const l = this.uniforms.get(name);
    if (l) this.gl.uniform1i(l, v);
    return this;
  }
  float(name, v) {
    const l = this.uniforms.get(name);
    if (l) this.gl.uniform1f(l, v);
    return this;
  }
  vec2(name, x, y) {
    const l = this.uniforms.get(name);
    if (l) this.gl.uniform2f(l, x, y);
    return this;
  }
  vec3(name, x, y, z) {
    const l = this.uniforms.get(name);
    if (l) this.gl.uniform3f(l, x, y, z);
    return this;
  }
  vec4(name, x, y, z, w) {
    const l = this.uniforms.get(name);
    if (l) this.gl.uniform4f(l, x, y, z, w);
    return this;
  }
  vec4Array(name, arr) {
    const l = this.uniforms.get(name);
    if (l) this.gl.uniform4fv(l, arr);
    return this;
  }
  mat4(name, m) {
    const l = this.uniforms.get(name);
    if (l) this.gl.uniformMatrix4fv(l, false, m);
    return this;
  }
}

/**
 * Interleaved static mesh.
 * `layout` is [{ name, size }] in the order the data is packed.
 */
export class Mesh {
  constructor(gl, program, data, indices, layout) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = indices ? gl.createBuffer() : null;
    this.count = indices ? indices.length : 0;
    this.vertexCount = 0;
    this.layout = layout;

    const stride = layout.reduce((s, a) => s + a.size, 0) * 4;
    this.vertexCount = data.length / (stride / 4);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    let offset = 0;
    for (const attr of layout) {
      const loc = program.attribs.get(attr.name);
      if (loc != null && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, stride, offset);
      }
      offset += attr.size * 4;
    }

    if (indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    }
    gl.bindVertexArray(null);
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (this.ibo) gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vbo);
    if (this.ibo) gl.deleteBuffer(this.ibo);
  }
}

/** Dynamic vertex stream for particles and billboards. */
export class DynamicMesh {
  constructor(gl, program, capacityFloats, layout) {
    this.gl = gl;
    this.data = new Float32Array(capacityFloats);
    this.floats = 0;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.stride = layout.reduce((s, a) => s + a.size, 0);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    let offset = 0;
    for (const attr of layout) {
      const loc = program.attribs.get(attr.name);
      if (loc != null && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, this.stride * 4, offset);
      }
      offset += attr.size * 4;
    }
    gl.bindVertexArray(null);
  }

  reset() {
    this.floats = 0;
  }

  push(values) {
    if (this.floats + values.length > this.data.length) return false;
    this.data.set(values, this.floats);
    this.floats += values.length;
    return true;
  }

  /** Room left, in vertices. */
  room() {
    return (this.data.length - this.floats) / this.stride;
  }

  flush() {
    if (this.floats === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.floats);
    gl.drawArrays(gl.TRIANGLES, 0, this.floats / this.stride);
  }
}

/** Colour + depth render target. */
export class RenderTarget {
  constructor(gl, width, height, { depth = true, filter = 'nearest' } = {}) {
    this.gl = gl;
    this.width = width;
    this.height = height;

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

    if (depth) {
      this.depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Render target incomplete: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }
}

/** Upload a 2D canvas as a texture. */
export function textureFromCanvas(gl, canvas, { filter = 'nearest', wrap = 'repeat', mips = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  const w = wrap === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
  if (mips) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter === 'linear' ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter === 'linear' ? gl.LINEAR : gl.NEAREST);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === 'linear' ? gl.LINEAR : gl.NEAREST);
  return tex;
}

export function updateTextureFromCanvas(gl, tex, canvas) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

/** Single full-screen triangle; cheaper and artefact-free versus two triangles. */
export function fullscreenTriangle(gl, program) {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = program.attribs.get('aPos');
  if (loc != null && loc >= 0) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  return {
    draw() {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
