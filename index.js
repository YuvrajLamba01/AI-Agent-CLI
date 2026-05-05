import "dotenv/config";
import { OpenAI } from "openai";
import readline from "readline";
import { runAgentForRequest } from "./agent.js";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function getUserInput(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

async function main() {
  console.log("\n🤖 Welcome to AI Agent CLI - Dynamic Website Generator");
  console.log("=".repeat(60));
  console.log("This agent builds websites using dynamic AI code generation.");
  console.log("Type 'exit' anytime to quit.\n");

  while (true) {
    const userRequest = await getUserInput(
      "📝 What would you like me to build? (e.g., 'Create a Scaler website'): "
    );

    if (!userRequest || !userRequest.trim()) {
      console.log("⚠️ Please enter a request.");
      continue;
    }

    if (userRequest.trim().toLowerCase() === "exit") {
      console.log("👋 Exiting AI Agent CLI.");
      break;
    }

    await runAgentForRequest(userRequest.trim(), client, GEMINI_MODEL);

    const continueChat = await getUserInput(
      "\n💬 Want to build another variation? (yes/no): "
    );

    if (continueChat.trim().toLowerCase() !== "yes") {
      console.log("👋 Exiting AI Agent CLI.");
      break;
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  rl.close();
  process.exit(1);
});
