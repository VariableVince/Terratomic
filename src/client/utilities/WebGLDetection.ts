export interface WebGLSupport {
  available: boolean;
  version: number | null; // 1 or 2
  renderer: string | null; // GPU info if available
  isSoftwareRendering: boolean; // SwiftShader, llvmpipe, etc.
  isChromiumBrowser: boolean; // Chrome or Edge
  browserName: string;
  fallbackReason?: string;
}

function detectBrowser(): { isChromium: boolean; name: string } {
  const ua = navigator.userAgent;

  // Check for Chromium-based browsers (order matters - check specific ones first)
  if (ua.includes("Edg/")) {
    return { isChromium: true, name: "Edge" };
  } else if (ua.includes("OPR/") || ua.includes("Opera/")) {
    return { isChromium: true, name: "Opera" };
  } else if (ua.includes("Brave/")) {
    return { isChromium: true, name: "Brave" };
  } else if (ua.includes("Vivaldi/")) {
    return { isChromium: true, name: "Vivaldi" };
  } else if (ua.includes("Chrome/") && !ua.includes("Edg/")) {
    return { isChromium: true, name: "Chrome" };
  } else if (ua.includes("Firefox/")) {
    return { isChromium: false, name: "Firefox" };
  } else if (ua.includes("Safari/") && !ua.includes("Chrome/")) {
    return { isChromium: false, name: "Safari" };
  } else {
    return { isChromium: false, name: "Unknown" };
  }
}

function isSoftwareRenderer(renderer: string | null): boolean {
  if (!renderer) return false;
  const softwareRenderers = [
    "swiftshader",
    "llvmpipe",
    "softpipe",
    "software",
    "microsoft basic render driver",
  ];
  return softwareRenderers.some((sw) => renderer.toLowerCase().includes(sw));
}

export function detectWebGLSupport(): WebGLSupport {
  // Try to create a canvas and get WebGL2 context first
  const canvas = document.createElement("canvas");
  const browser = detectBrowser();

  // Try WebGL2 first
  const gl = canvas.getContext("webgl2");
  if (gl) {
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : null;
    return {
      available: true,
      version: 2,
      renderer,
      isSoftwareRendering: isSoftwareRenderer(renderer),
      isChromiumBrowser: browser.isChromium,
      browserName: browser.name,
    };
  }

  // Fall back to WebGL1
  const gl1 =
    canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
  if (gl1 && gl1 instanceof WebGLRenderingContext) {
    const debugInfo = gl1.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo
      ? gl1.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : null;
    return {
      available: true,
      version: 1,
      renderer,
      isSoftwareRendering: isSoftwareRenderer(renderer),
      isChromiumBrowser: browser.isChromium,
      browserName: browser.name,
    };
  }

  // No WebGL support
  return {
    available: false,
    version: null,
    renderer: null,
    isSoftwareRendering: false,
    isChromiumBrowser: browser.isChromium,
    browserName: browser.name,
    fallbackReason: "WebGL context could not be created",
  };
}
