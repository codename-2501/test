import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendCommandToFigma } from "../utils/websocket";

/**
 * Register the execute_plugin_code tool to the MCP server.
 * Allows arbitrary JavaScript execution inside the Figma Plugin sandbox,
 * giving full access to the Figma Plugin API.
 */
export function registerExecuteTools(server: McpServer): void {
  server.tool(
    "execute_plugin_code",
    `Execute arbitrary JavaScript code inside the Figma Plugin sandbox with full Figma Plugin API access.

The code runs as an async function body. Use \`return\` to return a value.
Available globals:
- \`figma\` — full Figma Plugin API (figma.createFrame, figma.currentPage, figma.root, etc.)
- \`storage\` — persistent object that survives across calls (use for caching node IDs, state, etc.)
- \`F\` — helper utilities (all async unless noted):
  - \`F.screen(name)\` — create 393x852 white frame on current page
  - \`F.frame(name, w, h, opts?)\` — create frame. opts: { x, y, fillColor, parentId }
  - \`F.text(content, opts?)\` — create text with font auto-loaded. opts: { x, y, fontSize, fontFamily, fontStyle, color, parentId, width, lineHeight, textAlignHorizontal }
  - \`F.rect(name, w, h, opts?)\` — create rectangle. opts: { x, y, fillColor, parentId }
  - \`F.ellipse(name, w, h, opts?)\` — create ellipse. opts: { x, y, fillColor, parentId }
  - \`F.color(hex)\` — (sync) convert '#RRGGBB' to {r,g,b} in 0-1 range
  - \`F.find(predicate, root?)\` — (sync) findAll nodes matching predicate
  - \`F.findByName(name, root?)\` — (sync) find first node by name
  - \`F.findById(id)\` — get node by ID (async)
  - \`F.recolor(oldHex, newHex, root?)\` — (sync) bulk replace SOLID fill/stroke colors. Returns count
  - \`F.loadFont(family, style)\` — load font with dedup cache

Example — create screen with header:
const screen = await F.screen('Login');
const title = await F.text('Welcome', { x:16, y:100, fontSize:20, fontStyle:'Bold', color:'#212121', parentId: screen.id });
return { screenId: screen.id, titleId: title.id };

Example — bulk recolor:
const count = F.recolor('#2196F3', '#1A73E8');
return count + ' nodes updated';

Example — loop with storage:
if (!storage.items) storage.items = [];
for (let i = 0; i < 10; i++) {
  const item = await F.text('Item ' + i, { x:16, y:60+i*56, fontSize:15, parentId: storage.screenId });
  storage.items.push(item.id);
}
return storage.items.length + ' items created';`,
    {
      code: z
        .string()
        .min(1)
        .describe(
          "JavaScript code to execute inside the Figma plugin sandbox. Runs as async function body. Has access to: figma, F (helpers), storage (persistent object)."
        ),
    },
    async ({ code }) => {
      try {
        const result = await sendCommandToFigma(
          "execute_plugin_code",
          { code },
          120000
        );
        return {
          content: [
            {
              type: "text",
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error in execute_plugin_code: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
