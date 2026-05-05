import { extractJsonObject, parseToolArgs, createToolMap } from "./tools.js";

/**
 * Agent system prompt
 */
function getSystemPrompt() {
  return `You are an advanced AI Agent specialized in creating professional website clones. You work in a structured way: INPUT → THINK → TOOL → OBSERVE → OUTPUT.

Your responsibility is to:
1. Analyze the user request thoroughly and break it into actionable steps.
2. Execute MULTIPLE THINK steps before each TOOL call to plan the approach.
3. Use tools to generate production-quality code.
4. Wait for OBSERVE feedback after each tool execution.
5. Create complete, professional websites that closely resemble the reference design.

SCALER ACADEMY DESIGN PRINCIPLES:
- Professional, modern aesthetic with clean typography and ample whitespace
- Color palette: Deep purples (#6366f1, #4f46e5), blues (#3b82f6), and gradients
- Clear visual hierarchy: bold headlines, supporting text, strong CTAs
- Card-based layouts for programs/courses with hover effects
- Sticky navigation header that remains accessible while scrolling
- Prominent hero section with compelling value proposition
- Statistics/metrics showcasing credibility and success rates
- Multi-column footer with organized links and company information
- Smooth animations and transitions for enhanced UX

QUALITY STANDARDS:
- Mobile-first responsive design (works on phones, tablets, desktops)
- Semantic HTML5 structure with proper accessibility attributes
- Modern CSS with flexbox/grid layouts and CSS variables
- Vanilla JavaScript with no framework dependencies
- Fast load times with optimized images and minimal external dependencies
- Professional error handling and graceful degradation
- Consistent spacing, colors, and typography throughout

Available Tools:
1. generateScalerHTML(projectPath) - Creates semantic HTML5 structure with header, hero, content sections, and footer.
2. generateScalerCSS(projectPath) - Generates responsive, professional CSS matching the design.
3. generateScalerJS(projectPath) - Adds interactivity and smooth user experience features.
4. createFile(filePath, content) - Creates custom files.
5. listFiles(dirPath) - Lists directory contents.
6. openInBrowser(filePath) - Prepares file URL for browser preview.

CRITICAL RULES:
1. Always respond with valid JSON only. Never include explanations outside the JSON.
2. Process one step at a time.
3. After each TOOL step, wait for OBSERVE feedback before proceeding.
4. Generate all three files: index.html, styles.css, script.js.
5. MUST include: <header>, Hero Section, <footer> (validation enforced).
6. Use 'scaler_website' as default output folder.
7. DO NOT skip steps - perform multiple THINK steps for planning.

OUTPUT FORMAT:
{ "step": "START|THINK|TOOL|OBSERVE|OUTPUT", "content": "description", "tool_name": "function_name", "tool_args": "arguments" }

BEGIN: Analyze the user's request carefully and create a detailed plan.`;
}

/**
 * Run the agent loop for a single user request
 */
export async function runAgentForRequest(userRequest, client, GEMINI_MODEL) {
  const system_prompt = getSystemPrompt();

  const messages = [
    { role: "system", content: system_prompt },
    { role: "user", content: userRequest },
  ];

  let stepCount = 0;
  const maxSteps = 24;

  // Create tool map with current context
  const tool_map = createToolMap(client, userRequest, GEMINI_MODEL);

  while (stepCount < maxSteps) {
    stepCount++;
    console.log(`\n${"─".repeat(60)}`);

    try {
      const response = await client.chat.completions.create({
        model: GEMINI_MODEL,
        messages,
        temperature: 0.4,
      });

      const content = response.choices[0]?.message?.content || "";
      let parsedContent;

      try {
        parsedContent = JSON.parse(extractJsonObject(content));
      } catch {
        console.log("⚠️ Could not parse response JSON. Asking agent to retry...");
        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content:
            'Please respond with exactly one valid JSON object and no extra text. Use this format: { "step": "...", "content": "...", "tool_name": "...", "tool_args": "..." }',
        });
        continue;
      }

      messages.push({ role: "assistant", content: JSON.stringify(parsedContent) });

      if (parsedContent.step === "START") {
        console.log("🚀 START");
        console.log(`   ${parsedContent.content}`);
      } else if (parsedContent.step === "THINK") {
        console.log("💭 THINKING");
        console.log(`   ${parsedContent.content}`);
      } else if (parsedContent.step === "TOOL") {
        console.log(`🔧 TOOL: ${parsedContent.tool_name}`);
        console.log(`   Args: ${JSON.stringify(parsedContent.tool_args)}`);

        if (!tool_map[parsedContent.tool_name]) {
          const unavailable = `Tool ${parsedContent.tool_name} is not available. Available tools: ${Object.keys(tool_map).join(", ")}`;
          console.log(`   ❌ ${unavailable}`);
          messages.push({
            role: "user",
            content: JSON.stringify({ step: "OBSERVE", content: unavailable }),
          });
          continue;
        }

        const args = parseToolArgs(parsedContent.tool_args);
        const toolResult = await tool_map[parsedContent.tool_name](args);
        console.log(`   ✅ Result: ${toolResult}`);

        // === SHORT-CIRCUIT: Stop after 3 files are created to avoid extra LLM calls ===
        try {
          const projectPathCandidate = (typeof args === "string" && args) || (args && args.projectPath) || "scaler_website";
          if (parsedContent.tool_name.includes("generateScaler")) {
            const listResult = await tool_map.listFiles(projectPathCandidate);
            const hasIndex = /index\.html/i.test(listResult);
            const hasCss = /styles\.css/i.test(listResult);
            const hasJs = /script\.js/i.test(listResult);
            if (hasIndex && hasCss && hasJs) {
              console.log("\n✨ FINAL OUTPUT");
              console.log(`   Successfully created website files in ${projectPathCandidate}`);
              console.log("\n" + "=".repeat(60));
              console.log("✅ Task completed successfully!");
              console.log("=".repeat(60));
              messages.push({role: "user", content: JSON.stringify({step: "OBSERVE", content: listResult})});
              return;
            }
          }
        } catch (e) {
          console.warn("⚠️ Short-circuit check:", e.message);
        }
        // === END SHORT-CIRCUIT ===

        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: toolResult }),
        });
      } else if (parsedContent.step === "OUTPUT") {
        console.log("✨ FINAL OUTPUT");
        console.log(`   ${parsedContent.content}`);
        console.log("\n" + "=".repeat(60));
        console.log("✅ Task completed successfully!");
        console.log("=".repeat(60));
        return;
      }
    } catch (error) {
      console.error("❌ Error:", error.message);
      return;
    }
  }

  if (stepCount >= maxSteps) {
    console.log("\n⏱️ Max steps reached. Agent stopping to prevent infinite loop.");
  }
}
