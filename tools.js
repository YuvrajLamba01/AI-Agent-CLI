import fs from "fs";
import path from "path";

/**
 * Ensure directory exists, creating parent directories if needed
 */
export function ensureDir(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    console.warn("⚠️ ensureDir: Invalid filePath type");
    return;
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Strip markdown code fences from text
 */
export function stripCodeFences(text) {
  if (!text) return "";
  let output = text.trim();

  const fenced = output.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  if (fenced) {
    output = fenced[1].trim();
  }

  return output;
}

/**
 * Extract the first valid JSON object from text with extra prose
 * Handles balanced braces, strings, and escape sequences
 */
export function extractJsonObject(text) {
  if (!text) return "";

  const source = stripCodeFences(text);
  const startIndex = source.indexOf("{");
  if (startIndex === -1) {
    return source;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index++) {
    const character = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return source.slice(startIndex);
}

/**
 * Resolve project path from tool arguments
 */
export function resolveProjectPath(toolArgs) {
  if (typeof toolArgs === "string" && toolArgs.trim()) {
    return toolArgs.trim();
  }

  if (toolArgs && typeof toolArgs === "object") {
    if (typeof toolArgs.projectPath === "string" && toolArgs.projectPath.trim()) {
      return toolArgs.projectPath.trim();
    }
  }

  return "scaler_website";
}

/**
 * Parse tool arguments (strings, JSON, or raw)
 */
export function parseToolArgs(rawArgs) {
  if (typeof rawArgs !== "string") return rawArgs;
  const trimmed = rawArgs.trim();
  if (!trimmed) return rawArgs;

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return rawArgs;
    }
  }

  return rawArgs;
}
/**
 * Normalize tool arguments: safely extract values from string or object input
 * Prevents fs.existsSync DEP0187 warnings by ensuring only strings are used
 */
export function normalizeArg(value, key, defaultValue = "") {
  if (typeof value === "string") {
    return value.trim() || defaultValue;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const extracted = value[key];
    if (typeof extracted === "string") {
      return extracted.trim() || defaultValue;
    }
  }
  return defaultValue;
}
/**
 * Create a file with content
 */
export async function createFile(filePath, content) {
  try {
    ensureDir(filePath);
    fs.writeFileSync(filePath, content, "utf-8");
    return `File created successfully at ${filePath}`;
  } catch (error) {
    return `Error creating file: ${error.message}`;
  }
}

/**
 * Get existing context from generated files in project
 */
export function getExistingContext(projectPath) {
  const context = [];
  const files = ["index.html", "styles.css", "script.js"];

  for (const fileName of files) {
    const fullPath = path.join(projectPath, fileName);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      context.push(`File: ${fileName}\n${content.slice(0, 6000)}`);
    }
  }

  return context.join("\n\n");
}

/**
 * Validate that HTML contains required sections: Header, Hero, Footer
 */
export function validateRequiredSections(html) {
  const hasHeader = /<header[\s>]/i.test(html);
  const hasHero = /class=["'][^"']*hero[^"']*["']|id=["']hero["']|<section[\s>][\s\S]*hero/i.test(html);
  const hasFooter = /<footer[\s>]/i.test(html);

  if (!hasHeader || !hasHero || !hasFooter) {
    return {
      ok: false,
      message:
        "Generated HTML is missing required sections. Must include Header, Hero section, and Footer.",
    };
  }

  return { ok: true, message: "ok" };
}

/**
 * Generate a website file (HTML, CSS, or JS) using LLM
 */
export async function generateWebsiteFile(client, currentUserRequest, projectPath, fileName, GEMINI_MODEL) {
  const filePath = path.join(projectPath, fileName);
  const existingContext = getExistingContext(projectPath);

  const fileInstructions = {
    "index.html": [
      "GENERATE COMPLETE HTML5 WITH PROPER DOCTYPE AND METADATA.",
      "Link rel='stylesheet' for styles.css in <head>.",
      "Place <script src='script.js'></script> before </body>.",
      "MUST include: <header> (sticky nav), <section class='hero'> (with CTA buttons), and <footer>.",
      "Use semantic HTML5 tags: <nav>, <main>, <section>, <article>, <aside>, <footer>.",
      "Add meta tags: charset, viewport (mobile-responsive), and description.",
      "Include meaningful content: company logo, navigation links, hero headline, value propositions, program cards, testimonials, statistics.",
      "Structure: Header (logo, nav, CTA) → Hero (headline, subheading, CTAs, visuals) → Features/Programs section (cards, descriptions) → Stats/Trust section → CTA section → Footer (links, social, copyright).",
      "Ensure all text is professional, clear, and compelling.",
      "Use proper heading hierarchy (h1 for main title, h2 for sections, h3 for subsections).",
      "Add alt text to all images. Use placeholder images from https://images.unsplash.com or similar.",
      "Include aria-labels and role attributes for accessibility.",
    ].join(" "),
    "styles.css": [
      "GENERATE COMPLETE PRODUCTION-QUALITY CSS.",
      "Use a mobile-first responsive approach (base styles for mobile, then media queries for larger screens).",
      "Define CSS variables at :root for colors, fonts, spacing (e.g., --primary-color, --spacing-unit).",
      "COLOR PALETTE: Primary #6366f1 or #4f46e5 (indigo), Secondary #3b82f6 (blue), Accent #ec4899 (pink), Neutral grays.",
      "TYPOGRAPHY: Use modern fonts like Inter, Segoe UI, or system fonts. Base size 16px. Line height 1.6 for readability.",
      "Use CSS Flexbox and Grid for layouts. No floats. Ensure responsive behavior.",
      "Media queries: @media (max-width: 768px) for tablets, @media (max-width: 480px) for mobile.",
      "Add smooth transitions and hover effects (transition: all 0.3s ease).",
      "Style buttons with clear states: default, hover, active, disabled.",
      "Add subtle animations: fade-in, slide-in on scroll (using keyframes).",
      "Ensure proper spacing with consistent margin/padding (multiples of 8px or 16px).",
      "Match all classes from HTML exactly. Use BEM naming if complex: block__element--modifier.",
      "Make header sticky (position: sticky or position: fixed with proper z-index).",
      "Ensure footer is at bottom of page or sticks if content is short (flexbox layout).",
      "Add box-shadow for depth. Use subtle shadows (0 1px 3px rgba(0,0,0,0.1)).",
      "Optimize performance: minimize repaints, use will-change sparingly.",
    ].join(" "),
    "script.js": [
      "GENERATE PRODUCTION-QUALITY VANILLA JAVASCRIPT.",
      "NO framework dependencies. Use pure ES6+ JavaScript.",
      "Add strict mode: 'use strict'; at the top.",
      "Implement features: mobile menu toggle, smooth scroll navigation, form handling, scroll animations.",
      "Use event delegation for better performance: addEventListener on parent elements.",
      "Add keyboard accessibility: handle Enter/Escape keys for modals and menus.",
      "Implement smooth scroll behavior: add event listeners to anchor links for smooth scrolling.",
      "Mobile menu: toggle class on hamburger click to show/hide menu. Close on link click or outside click.",
      "Animations on scroll: use Intersection Observer API for efficient scroll-triggered animations.",
      "Add form validation: check required fields, validate email format, show error messages.",
      "Error handling: wrap API calls in try-catch. Handle network errors gracefully.",
      "Performance: debounce scroll/resize events (at least 100ms delay).",
      "DOM optimization: cache selectors that are used multiple times.",
      "Add analytics/tracking placeholders (as comments) where applicable.",
      "Ensure all interactive elements have clear feedback (color change, animation, cursor change).",
      "Test all features work without JavaScript disabled (graceful degradation).",
    ].join(" "),
  };

  try {
    const response = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: [
            "You are a world-class senior frontend engineer with expertise in creating professional, production-quality websites.",
            "CRITICAL: Generate ONLY the requested file type. No markdown fences, no explanations, no comments outside the code.",
            "Your code must be: clean, efficient, accessible, responsive, and performant.",
            "Follow modern best practices: semantic HTML, CSS variables, ES6+ JavaScript, mobile-first design.",
            "Ensure pixel-perfect implementation that matches professional standards.",
            "Write code that is self-documenting with clear variable names and logical structure.",
            "Think about user experience: accessibility (WCAG), performance, and visual polish.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `User request: ${currentUserRequest || "Create a modern website"}`,
            `Target file: ${fileName}`,
            `Project folder: ${projectPath}`,
            `Instructions: ${fileInstructions[fileName]}`,
            existingContext ? `Existing files context:\n${existingContext}` : "No files exist yet.",
          ].join("\n\n"),
        },
      ],
    });

    const generated = stripCodeFences(response.choices[0]?.message?.content || "");
    if (!generated) {
      return `Error generating ${fileName}: Empty model response`;
    }

    if (fileName === "index.html") {
      const validation = validateRequiredSections(generated);
      if (!validation.ok) {
        return `Error generating ${fileName}: ${validation.message}`;
      }
    }

    return await createFile(filePath, generated);
  } catch (error) {
    return `Error generating ${fileName}: ${error.message}`;
  }
}

/**
 * Tool: Generate HTML
 */
export async function generateScalerHTML(toolArgs, client, currentUserRequest, GEMINI_MODEL) {
  const projectPath = resolveProjectPath(toolArgs);
  return generateWebsiteFile(client, currentUserRequest, projectPath, "index.html", GEMINI_MODEL);
}

/**
 * Tool: Generate CSS
 */
export async function generateScalerCSS(toolArgs, client, currentUserRequest, GEMINI_MODEL) {
  const projectPath = resolveProjectPath(toolArgs);
  return generateWebsiteFile(client, currentUserRequest, projectPath, "styles.css", GEMINI_MODEL);
}

/**
 * Tool: Generate JavaScript
 */
export async function generateScalerJS(toolArgs, client, currentUserRequest, GEMINI_MODEL) {
  const projectPath = resolveProjectPath(toolArgs);
  return generateWebsiteFile(client, currentUserRequest, projectPath, "script.js", GEMINI_MODEL);
}

/**
 * Tool: List files in directory
 */
export async function listFiles(dirPath) {
  try {
    const normalizedPath = normalizeArg(dirPath, "dirPath", "scaler_website");
    if (!normalizedPath || typeof normalizedPath !== "string") {
      return `Error listing files: Invalid directory path`;
    }
    if (!fs.existsSync(normalizedPath)) {
      return `Directory does not exist: ${normalizedPath}`;
    }
    const files = fs.readdirSync(normalizedPath);
    return `Files in ${normalizedPath}: ${files.join(", ")}`;
  } catch (error) {
    return `Error listing files: ${error.message}`;
  }
}

/**
 * Tool: Prepare file URL for browser opening
 */
export async function openInBrowser(filePath) {
  try {
    const normalizedPath = normalizeArg(filePath, "filePath", "scaler_website/index.html");
    if (!normalizedPath || typeof normalizedPath !== "string") {
      return `Error: Invalid file path`;
    }
    if (!fs.existsSync(normalizedPath)) {
      return `File does not exist: ${normalizedPath}`;
    }
    const absolutePath = path.resolve(normalizedPath);
    const fileUrl = `file:///${absolutePath.replace(/\\/g, "/")}`;
    console.log(`\n🌐 Opening in browser: ${fileUrl}\n`);
    return `File ready to open: ${fileUrl}`;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

/**
 * Create tool map for agent to use
 */
export function createToolMap(client, currentUserRequest, GEMINI_MODEL) {
  return {
    createFile: (args) => createFile(args.filePath, args.content),
    generateScalerHTML: (args) => generateScalerHTML(args, client, currentUserRequest, GEMINI_MODEL),
    generateScalerCSS: (args) => generateScalerCSS(args, client, currentUserRequest, GEMINI_MODEL),
    generateScalerJS: (args) => generateScalerJS(args, client, currentUserRequest, GEMINI_MODEL),
    listFiles: (args) => listFiles(args),
    openInBrowser: (args) => openInBrowser(args),
  };
}
