import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendCommandToFigma } from "../utils/websocket";

/**
 * Register batch execution tools to the MCP server.
 * batch_execute sends multiple Figma commands in a single WebSocket round-trip,
 * dramatically reducing latency when creating complex designs.
 *
 * Supports $N.field references to pipe results between commands:
 *   $0.id → result of command[0].id
 *   $2    → entire result of command[2]
 */
export function registerBatchTools(server: McpServer): void {
  server.tool(
    "batch_execute",
    `Execute multiple Figma commands in a single round-trip. Each command runs sequentially on the Figma side, but only one LLM inference step is needed.

Use $N.field syntax to reference results from earlier commands in the batch:
- "$0.id" → the 'id' field from command 0's result
- "$1.name" → the 'name' field from command 1's result
- "$2" → the entire result object from command 2

Example: Create a frame, then add text inside it:
[
  { "cmd": "create_frame", "params": { "x": 0, "y": 0, "width": 393, "height": 852, "name": "Screen" } },
  { "cmd": "create_text", "params": { "x": 16, "y": 100, "text": "Hello", "parentId": "$0.id" } }
]

Available commands: create_frame, create_rectangle, create_text, create_ellipse, create_component_instance, clone_node, insert_child, move_node, resize_node, set_fill_color, set_stroke_color, set_corner_radius, set_text_content, set_font_name, set_font_size, set_font_weight, set_line_height, load_font_async, set_auto_layout, set_effects, rename_node, delete_node, set_node_properties, group_nodes, set_text_align, set_selection_colors, set_image, set_gradient, and all other Figma commands.`,
    {
      commands: z.array(
        z.object({
          cmd: z.string().describe("Figma command name (e.g. 'create_frame', 'set_text_content')"),
          params: z.record(z.any()).optional().describe("Command parameters. Use '$N.field' strings to reference previous results."),
        })
      ).min(1).max(100).describe("Array of commands to execute sequentially. Max 100 commands per batch."),
    },
    async ({ commands }) => {
      try {
        const result = await sendCommandToFigma("batch_execute", { commands }, 120000);
        const typedResult = result as {
          results: any[];
          errors: Array<{ index: number; cmd: string; error: string }>;
          totalExecuted: number;
        };

        const successCount = typedResult.results.filter((r: any) => r !== null).length;
        const errorCount = typedResult.errors.length;

        // Build compact summary
        const lines: string[] = [
          `Batch: ${successCount}/${typedResult.totalExecuted} succeeded` +
          (errorCount > 0 ? `, ${errorCount} failed` : ""),
        ];

        // Include result IDs for reference
        typedResult.results.forEach((r: any, i: number) => {
          if (r && r.id) {
            lines.push(`  $${i}: id=${r.id}${r.name ? ` name="${r.name}"` : ""}`);
          }
        });

        // Include errors
        if (errorCount > 0) {
          lines.push("Errors:");
          typedResult.errors.forEach((e: { index: number; cmd: string; error: string }) => {
            lines.push(`  [${e.index}] ${e.cmd}: ${e.error}`);
          });
        }

        return {
          content: [
            {
              type: "text",
              text: lines.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error in batch_execute: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
