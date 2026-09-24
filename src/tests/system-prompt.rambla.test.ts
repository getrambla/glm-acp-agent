// RAMBLA-FORK: feature: 2026-09-24-feat-system-prompt-self-identity.md: tests that the prompt names its own provider and model and defaults subagent spawns to itself.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../protocol/system-prompt.js";

test("environment block renders provider and model lines", () => {
  const prompt = buildSystemPrompt({
    cwd: "/tmp/proj",
    tools: ["read_file"],
    provider: "glm-acp-agent",
    model: "glm-4.6",
  });
  assert.match(prompt, /^- Provider: glm-acp-agent$/m);
  assert.match(prompt, /^- Model: glm-4\.6$/m);
});

test("tools section carries the subagent self-identity default bullet", () => {
  const prompt = buildSystemPrompt({
    cwd: "/tmp/proj",
    tools: [],
    provider: "glm-acp-agent",
    model: "glm-4.6",
  });
  const toolsSection = prompt.slice(
    prompt.indexOf("<tools>"),
    prompt.indexOf("</tools>")
  );
  assert.match(toolsSection, /subagents?\b/);
  assert.match(toolsSection, /omit the provider argument/);
});
