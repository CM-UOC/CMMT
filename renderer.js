const vertexSource = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const fragmentSource = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_scene;
  uniform float u_heroProgress;
  uniform float u_sceneProgress;
  uniform float u_selection;
  uniform float u_quality;
  uniform float u_planetReady;
  uniform float u_eyeReady;
  uniform float u_closedReady;
  uniform sampler2D u_planetTexture;
  uniform sampler2D u_eyeTexture;
  uniform sampler2D u_closedTexture;

  #define PI 3.14159265359

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float hash31(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = .52;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise3(p);
      p = p * 2.03 + vec3(7.1, 3.7, 5.9);
      amplitude *= .5;
    }
    return value;
  }

  float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  vec3 rotateAxis(vec3 value, vec3 axis, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return value * cosine + cross(axis, value) * sine + axis * dot(axis, value) * (1.0 - cosine);
  }

  vec3 tonemap(vec3 colour) {
    colour = max(colour, 0.0);
    colour = (colour * (2.51 * colour + .03)) / (colour * (2.43 * colour + .59) + .14);
    return pow(clamp(colour, 0.0, 1.0), vec3(.88));
  }

  vec2 coverUv(vec2 frag) {
    vec2 uv = frag / u_resolution;
    float screenAspect = u_resolution.x / u_resolution.y;
    float imageAspect = 1.776833;
    if (screenAspect > imageAspect) uv.y = (uv.y - .5) * (imageAspect / screenAspect) + .5;
    else uv.x = (uv.x - .5) * (screenAspect / imageAspect) + .5;
    return uv;
  }

  vec3 irisMaterial(vec2 q, float radius, float pupilRadius) {
    float radial = length(q) / max(radius, .001);
    float angle = atan(q.y, q.x);
    float fibreNoise = fbm(vec3(cos(angle)*2.4, sin(angle)*2.4, radial*6.7));
    float breakNoise = fbm(vec3(q*8.5,radial*4.2));
    float fibreA = .5+.5*sin(angle*(72.0+fibreNoise*24.0)+radial*24.0+fibreNoise*13.0);
    float fibreB = .5+.5*sin(angle*127.0-radial*41.0+breakNoise*18.0);
    float spokes = smoothstep(.58,.92,fibreA*.64+fibreB*.2+breakNoise*.3);
    spokes *= smoothstep(.12,.5,radial) * (1.0-smoothstep(.92,1.02,radial));
    float ring = .5+.5*sin(radial*73.0+fibreNoise*8.0);
    float pupil = 1.0 - smoothstep(pupilRadius, pupilRadius + .035, radial);
    float irisEdge = 1.0 - smoothstep(.72, .99, radial);
    vec3 iris = mix(vec3(.016,.045,.035),vec3(.12,.29,.18),spokes);
    iris += vec3(.34,.27,.13)*ring*spokes*.27;
    iris += vec3(.20,.49,.38)*pow(spokes,3.0)*.1;
    iris *= 1.0-smoothstep(.68,.95,breakNoise)*.26;
    iris *= irisEdge;
    iris = mix(iris, vec3(.0015,.004,.003), pupil);
    return iris;
  }

  vec3 renderHero(vec2 uv, vec2 frag) {
    float p = clamp(u_heroProgress, 0.0, 1.0);
    vec3 colour = vec3(.002,.006,.004);
    vec2 starGrid = frag / u_resolution.y * 72.0;
    vec2 starId = floor(starGrid);
    vec2 starCell = fract(starGrid) - .5;
    vec2 starJitter = vec2(hash21(starId + 1.7), hash21(starId + 9.2)) - .5;
    float star = (1.0-smoothstep(.018,.075,length(starCell-starJitter*.56))) * step(.9955,hash21(starId+4.2));
    vec2 farGrid = frag / u_resolution.y * 38.0;
    vec2 farId = floor(farGrid);
    vec2 farCell = fract(farGrid) - .5;
    vec2 farJitter = vec2(hash21(farId + 13.7), hash21(farId + 21.4)) - .5;
    float farStar = (1.0-smoothstep(.025,.09,length(farCell-farJitter*.52))) * step(.9945,hash21(farId+19.7));
    float starsVisible = 1.0-smoothstep(.32,.62,p);
    colour += vec3(.72,.79,.75) * star * starsVisible * .72;
    colour += vec3(.48,.59,.54) * farStar * starsVisible * .36;

    float approach = smoothstep(.05,.56,p);
    float breathWindow = smoothstep(.40,.50,p) * (1.0-smoothstep(.61,.69,p));
    float breath = sin(u_time * .34) * .0012 * breathWindow;
    float radius = mix(.25,.9,approach) + breath;
    vec2 centre = vec2(mix(0.0,-.04,approach), mix(.04,0.0,approach));
    vec2 q = uv - centre;
    float rr = dot(q,q);
    float sphereMask = 1.0 - smoothstep(radius*radius-.009, radius*radius+.006, rr);

    if (sphereMask > 0.0) {
      float z = sqrt(max(radius*radius-rr,0.0));
      vec3 n = normalize(vec3(q,z));
      vec3 lightDir = normalize(vec3(-.62,-.38,.92));
      float diffuse = max(dot(n,lightDir),0.0);
      float halfLight = smoothstep(-.28,.68,dot(n,lightDir));
      float rim = pow(1.0-max(n.z,0.0),3.0);

      vec3 axis = normalize(vec3(.28,.91,.30));
      vec3 rotatedN = rotateAxis(n, axis, u_time * .014);
      vec3 samplePoint = rotatedN * 3.3 + vec3(p * .07,2.1,.7);
      float continents = fbm(samplePoint);
      float ridges = fbm(rotatedN * 10.0 + continents * 2.2);
      float land = smoothstep(.50,.63,continents + ridges * .18);
      float cloud = smoothstep(.57,.74,fbm(rotatedN * 7.4 + vec3(5.0+u_time*.004,1.0,2.0)));
      vec3 ocean = mix(vec3(.012,.038,.049),vec3(.035,.15,.145),ridges);
      vec3 mineral = mix(vec3(.10,.16,.105),vec3(.39,.34,.17),ridges*ridges);
      vec3 planet = mix(ocean,mineral,land);
      planet *= .18 + diffuse * 1.06;
      planet += cloud * halfLight * vec3(.28,.35,.31) * .32;
      planet += rim * vec3(.10,.28,.25) * (.3 + approach * .38);
      vec2 planetUv = vec2(.5) + vec2(rotatedN.x*.176,-rotatedN.y*.313);
      vec3 photographicPlanet = texture2D(u_planetTexture,planetUv).rgb;
      float planetPlate = (1.0-smoothstep(.28,.49,p)) * u_planetReady;
      photographicPlanet *= .72 + n.z * .19;
      planet = mix(planet,photographicPlanet,planetPlate*.94);

      float pupilRadius = mix(.105,.25,smoothstep(.48,.72,p));
      vec3 proceduralIris = irisMaterial(q,radius,pupilRadius);
      float sphereRadial = length(n.xy);
      vec2 sphereDirection = n.xy / max(sphereRadial,.001);
      float irisSampleRadius = pow(sphereRadial,.68);
      vec2 irisUv = vec2(.515,.50) + vec2(sphereDirection.x*.135,-sphereDirection.y*.21) * irisSampleRadius;
      vec3 photographicIris = texture2D(u_eyeTexture,irisUv).rgb;
      float irisLuma = dot(photographicIris,vec3(.2126,.7152,.0722));
      photographicIris = mix(vec3(irisLuma),photographicIris,.94);
      photographicIris *= vec3(.96,1.0,.97);
      float centralPupil = 1.0-smoothstep(pupilRadius,pupilRadius+.035,length(q)/max(radius,.001));
      photographicIris = mix(photographicIris,vec3(.0015,.004,.003),centralPupil);
      vec3 iris = mix(proceduralIris,photographicIris,u_eyeReady*.9);
      iris *= .24 + n.z * .8;
      iris += pow(max(dot(n,normalize(vec3(-.32,-.44,1.0))),0.0),52.0) * vec3(.72,.86,.76) * .22;
      float organic = smoothstep(.31,.69,p);
      float sharedStructure = fbm(rotatedN*4.8 + vec3(.6,2.4,1.3));
      float organicDissolve = smoothstep(sharedStructure-.16,sharedStructure+.16,organic);
      float membrane = smoothstep(.35,.58,p) * (1.0-smoothstep(.66,.76,p));
      vec3 surface = mix(planet,iris,organicDissolve);
      surface += membrane * vec3(.12,.28,.18) * fbm(n*17.0) * rim;
      colour = mix(colour,tonemap(surface*1.5),sphereMask);
    }

    float edge = length(q)-radius;
    float atmosphere = exp(-max(edge,0.0)*82.0) * smoothstep(.0,.009,edge) * (1.0-smoothstep(.0,.88,p));
    colour += vec3(.12,.25,.23) * atmosphere * .18;

    float closeLid = smoothstep(.635,.695,p);
    float reopenLid = smoothstep(.72,.845,p);
    float lidOpen = mix(1.0,.0,closeLid);
    lidOpen = mix(lidOpen,1.0,reopenLid);
    float eyeX = uv.x / 1.14;
    float horizontal = 1.0-smoothstep(.86,1.04,abs(eyeX));
    float closedLine = -.012 - eyeX*.035 + eyeX*eyeX*.045;
    float upperOpen = .315*(1.0-eyeX*eyeX) - .018 - eyeX*.025;
    float lowerOpen = -.22*(1.0-eyeX*eyeX) - .025 + eyeX*.018;
    float upperLid = mix(closedLine,upperOpen,lidOpen);
    float lowerLid = mix(closedLine-.012,lowerOpen,pow(max(lidOpen,0.0),.62));
    float aboveLower = smoothstep(lowerLid-.014,lowerLid+.014,uv.y);
    float belowUpper = 1.0-smoothstep(upperLid-.014,upperLid+.014,uv.y);
    float aperture = aboveLower*belowUpper*horizontal;
    float openEnvelope = smoothstep(lowerOpen-.025,lowerOpen+.018,uv.y) * (1.0-smoothstep(upperOpen-.018,upperOpen+.025,uv.y)) * horizontal;
    float plateReady = min(u_eyeReady,u_closedReady);
    float skinArrival = smoothstep(.64,.69,p) * plateReady;
    float platePhase = smoothstep(.692,.705,p) * plateReady;
    vec2 eyeUv = coverUv(frag);
    vec3 eye = texture2D(u_eyeTexture,eyeUv).rgb;
    vec3 closedEye = texture2D(u_closedTexture,eyeUv).rgb;
    float eyeLuma = dot(eye,vec3(.2126,.7152,.0722));
    eye = mix(vec3(eyeLuma),eye,.92);
    eye *= vec3(.96,1.0,.97);
    eye = tonemap(eye*1.04);
    float closedLuma = dot(closedEye,vec3(.2126,.7152,.0722));
    closedEye = mix(vec3(closedLuma),closedEye,.92);
    closedEye *= vec3(.96,1.0,.97);
    closedEye = tonemap(closedEye*1.03);
    float surroundingBlend = smoothstep(.78,.99,reopenLid);
    vec3 eyeComposite = mix(closedEye,eye,surroundingBlend);
    eyeComposite = mix(eyeComposite,eye,aperture*openEnvelope);
    float wet = pow(max(0.0,1.0-length(uv-vec2(-.13,.15))/.08),8.0) * aperture;
    eyeComposite += vec3(.62,.78,.68)*wet*.32;
    vec3 cornealFibre = irisMaterial(uv,.43,.16);
    float cornealMask = (1.0-smoothstep(.31,.45,length(uv))) * aperture * lidOpen;
    eyeComposite = mix(eyeComposite,tonemap(cornealFibre*.82),cornealMask*.13);
    colour = mix(colour,closedEye,skinArrival*(1.0-aperture));
    colour = mix(colour,eyeComposite,platePhase);
    return colour;
  }

  vec3 renderTerrain(vec2 uv) {
    vec3 colour = vec3(.006,.017,.012);
    vec2 p = uv;
    float depthWarp = 1.0 + max(-p.y,0.0)*.42;
    vec3 fieldPoint = vec3(p.x*1.45*depthWarp,p.y*1.18,u_sceneProgress*.42);
    float height = fbm(fieldPoint*2.4) + fbm(fieldPoint*5.8)*.24;
    float contourValue = abs(fract(height*12.0+u_sceneProgress*.45)-.5);
    float contour = 1.0-smoothstep(.015,.055,contourValue);
    float major = 1.0-smoothstep(.015,.035,abs(fract(height*3.0)-.5));
    float fog = 1.0-smoothstep(.12,1.5,length(p*vec2(.7,1.0)));
    colour += vec3(.075,.20,.14)*height*.32;
    colour += vec3(.33,.52,.39)*contour*.19*fog;
    colour += vec3(.62,.78,.65)*major*.08*fog;
    float route = segmentDistance(p,vec2(-1.15,-.58),vec2(-.35,-.12));
    route = min(route,segmentDistance(p,vec2(-.35,-.12),vec2(.25,-.28)));
    route = min(route,segmentDistance(p,vec2(.25,-.28),vec2(.95,.46)));
    float routeLine = 1.0-smoothstep(.006,.018,route);
    colour += vec3(.42,.68,.22)*routeLine*.45*smoothstep(.0,.8,u_sceneProgress);
    return colour;
  }

  vec3 renderPractice(vec2 uv) {
    vec3 colour = vec3(.004,.012,.009);
    float drift = (u_sceneProgress-.5)*.1;
    vec2 n0=vec2(-1.0,.52+drift), n1=vec2(-.82,-.48), n2=vec2(-.28,.68), n3=vec2(.05,-.62), n4=vec2(.58,.47), n5=vec2(1.02,-.18);
    vec2 focus=mix(vec2(.88,.0),vec2(.18,.02),smoothstep(.1,.8,u_sceneProgress));
    float lines=segmentDistance(uv,n0,focus);
    lines=min(lines,segmentDistance(uv,n1,focus)); lines=min(lines,segmentDistance(uv,n2,focus));
    lines=min(lines,segmentDistance(uv,n3,focus)); lines=min(lines,segmentDistance(uv,n4,focus)); lines=min(lines,segmentDistance(uv,n5,focus));
    float network=1.0-smoothstep(.006,.021,lines);
    colour += vec3(.28,.48,.37)*network*.22;
    float nodes=0.0;
    nodes=max(nodes,1.0-smoothstep(.014,.04,length(uv-n0))); nodes=max(nodes,1.0-smoothstep(.014,.04,length(uv-n1)));
    nodes=max(nodes,1.0-smoothstep(.014,.04,length(uv-n2))); nodes=max(nodes,1.0-smoothstep(.014,.04,length(uv-n3)));
    nodes=max(nodes,1.0-smoothstep(.014,.04,length(uv-n4))); nodes=max(nodes,1.0-smoothstep(.014,.04,length(uv-n5)));
    colour += vec3(.43,.66,.51)*nodes*.45;
    float focusNode=1.0-smoothstep(.016,.052,length(uv-focus));
    vec3 selectedColour=mix(vec3(.49,.70,.34),vec3(.70,.42,.25),u_selection/4.0);
    colour += selectedColour*focusNode*.7;
    float ring=abs(length(uv-focus)-(.16+.025*sin(u_sceneProgress*PI)));
    colour += vec3(.18,.45,.30)*(1.0-smoothstep(.004,.014,ring))*.25;
    return colour;
  }

  vec3 renderQuestions(vec2 uv) {
    vec3 colour = vec3(.005,.016,.013);
    vec2 gridUv=uv*vec2(3.0,2.0);
    float grid=min(abs(fract(gridUv.x)-.5),abs(fract(gridUv.y)-.5));
    colour += vec3(.18,.34,.28)*(1.0-smoothstep(.47,.495,grid))*.055;
    vec2 a=vec2(-1.2,-.32), b=vec2(-.68,.28), c=vec2(-.05,-.06), d=vec2(.52,.38), e=vec2(1.1,-.16);
    float route=segmentDistance(uv,a,b); route=min(route,segmentDistance(uv,b,c)); route=min(route,segmentDistance(uv,c,d)); route=min(route,segmentDistance(uv,d,e));
    float routeLine=1.0-smoothstep(.007,.021,route);
    colour += mix(vec3(.18,.48,.40),vec3(.49,.31,.20),u_sceneProgress)*routeLine*.4;
    float pulsePosition=fract(u_sceneProgress*1.25);
    vec2 pulse=mix(a,e,pulsePosition);
    float pulseDot=1.0-smoothstep(.015,.06,length(uv-pulse));
    colour += vec3(.62,.78,.32)*pulseDot*.4;
    float fog=1.0-smoothstep(.25,1.6,length(uv*vec2(.65,1.0)));
    return colour*fog;
  }

  vec3 renderEpilogue(vec2 uv, vec2 frag) {
    vec3 colour=vec3(.002,.006,.004);
    vec2 eyeUv=coverUv(frag);
    eyeUv=.5+(eyeUv-.5)*.42;
    vec3 eye=texture2D(u_eyeTexture,eyeUv).rgb*u_eyeReady;
    float luma=dot(eye,vec3(.2126,.7152,.0722));
    eye=mix(vec3(luma)*vec3(.72,.9,.77),eye,.56)*.58;
    float aperture=1.0-smoothstep(.42,.58,abs(uv.y+.015)+uv.x*uv.x*.105);
    colour=mix(colour,tonemap(eye),aperture*u_eyeReady);
    float radius=.82;
    vec3 iris=irisMaterial(uv,radius,.24);
    float irisMask=1.0-smoothstep(.72,.84,length(uv));
    colour=mix(colour,tonemap(iris*.7),irisMask*.32);
    float vignette=1.0-smoothstep(.2,1.55,length(uv*vec2(.75,1.0)));
    return colour*mix(.35,1.0,vignette);
  }

  void main() {
    vec2 frag=gl_FragCoord.xy;
    vec2 uv=(frag*2.0-u_resolution.xy)/min(u_resolution.x,u_resolution.y);
    uv.y*=-1.0;
    vec3 colour;
    if (u_scene<.5) colour=renderHero(uv,frag);
    else if (u_scene<1.5) colour=renderTerrain(uv);
    else if (u_scene<2.5) colour=renderPractice(uv);
    else if (u_scene<3.5) colour=renderQuestions(uv);
    else colour=renderEpilogue(uv,frag);
    float vignette=1.0-smoothstep(.24,1.65,length(uv*vec2(.78,1.0)));
    colour*=mix(.52,1.0,vignette);
    colour+=(hash21(frag+u_sceneProgress*97.0)-.5)*.012;
    gl_FragColor=vec4(colour,1.0);
  }
`;

function createCinemaRenderer(canvas, options = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    options.onFailure?.();
    return null;
  }

  let disposed = false;
  let announcedReady = false;
  let planetReady = 0;
  let eyeReady = 0;
  let closedReady = 0;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Cinema shader unavailable:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    options.onFailure?.();
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Cinema renderer unavailable:', gl.getProgramInfoLog(program));
    options.onFailure?.();
    return null;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name) => gl.getUniformLocation(program, name);
  const uniforms = {
    resolution: uniform('u_resolution'), time: uniform('u_time'), scene: uniform('u_scene'),
    heroProgress: uniform('u_heroProgress'), sceneProgress: uniform('u_sceneProgress'),
    selection: uniform('u_selection'), quality: uniform('u_quality'), planetReady: uniform('u_planetReady'),
    eyeReady: uniform('u_eyeReady'), closedReady: uniform('u_closedReady'), planetTexture: uniform('u_planetTexture'),
    eyeTexture: uniform('u_eyeTexture'), closedTexture: uniform('u_closedTexture'),
  };

  const planetTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, planetTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3,7,5,255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const eyeTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, eyeTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3,7,5,255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const closedTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, closedTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3,7,5,255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const planetImage = new Image();
  planetImage.decoding = 'async';
  planetImage.fetchPriority = 'high';
  planetImage.onload = () => {
    if (disposed) return;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, planetTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, planetImage);
    planetReady = 1;
    options.onInvalidate?.();
  };
  planetImage.onerror = () => options.onInvalidate?.();
  planetImage.src = 'hero-planet-v2.jpg';

  const eyeImage = new Image();
  eyeImage.decoding = 'async';
  eyeImage.fetchPriority = 'high';
  eyeImage.onload = () => {
    if (disposed) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, eyeTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, eyeImage);
    eyeReady = 1;
    options.onInvalidate?.();
  };
  eyeImage.onerror = () => options.onInvalidate?.();
  eyeImage.src = 'hero-iris-v2.jpg';

  const closedImage = new Image();
  closedImage.decoding = 'async';
  closedImage.fetchPriority = 'high';
  closedImage.onload = () => {
    if (disposed) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, closedTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, closedImage);
    closedReady = 1;
    options.onInvalidate?.();
  };
  closedImage.onerror = () => options.onInvalidate?.();
  closedImage.src = 'hero-eye-closed-v2.jpg';

  const quality = matchMedia('(pointer: coarse)').matches || innerWidth < 800 ? .65 : 1;

  const resize = () => {
    if (disposed) return;
    const cap = innerWidth < 800 || matchMedia('(pointer: coarse)').matches ? 1.25 : 1.7;
    const scale = Math.min(devicePixelRatio || 1, cap);
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const draw = ({ time = 0, scene = 0, heroProgress = 0, sceneProgress = 0, selection = 0 } = {}) => {
    if (disposed || gl.isContextLost()) return;
    resize();
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.scene, scene);
    gl.uniform1f(uniforms.heroProgress, heroProgress);
    gl.uniform1f(uniforms.sceneProgress, sceneProgress);
    gl.uniform1f(uniforms.selection, selection);
    gl.uniform1f(uniforms.quality, quality);
    gl.uniform1f(uniforms.planetReady, planetReady);
    gl.uniform1f(uniforms.eyeReady, eyeReady);
    gl.uniform1f(uniforms.closedReady, closedReady);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, planetTexture);
    gl.uniform1i(uniforms.planetTexture, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, eyeTexture);
    gl.uniform1i(uniforms.eyeTexture, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, closedTexture);
    gl.uniform1i(uniforms.closedTexture, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!announcedReady && planetReady) {
      announcedReady = true;
      options.onReady?.();
    }
  };

  const onContextLost = (event) => {
    event.preventDefault();
    options.onFailure?.();
  };
  const onContextRestored = () => options.onRestore?.();
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    gl.deleteTexture(planetTexture);
    gl.deleteTexture(eyeTexture);
    gl.deleteTexture(closedTexture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  };

  return { draw, resize, dispose };
}

window.createCinemaRenderer = createCinemaRenderer;
